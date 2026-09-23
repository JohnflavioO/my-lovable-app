
-- 1. Table for OS parts (linked to stock)
CREATE TABLE IF NOT EXISTS public.technical_order_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.technical_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.technical_products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  total_price numeric(12,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.technical_order_parts TO authenticated;
GRANT ALL ON public.technical_order_parts TO service_role;

ALTER TABLE public.technical_order_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Support access order parts"
  ON public.technical_order_parts FOR ALL TO authenticated
  USING (is_admin() OR is_gestor() OR is_support_any())
  WITH CHECK (is_admin() OR is_gestor() OR is_support_any());

CREATE TRIGGER trg_order_parts_updated_at BEFORE UPDATE ON public.technical_order_parts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Trigger: keep stock in sync with OS parts
CREATE OR REPLACE FUNCTION public.sync_stock_on_order_parts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.product_id IS NOT NULL THEN
      UPDATE public.technical_products SET quantity = quantity - NEW.quantity WHERE id = NEW.product_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.product_id IS NOT NULL THEN
      UPDATE public.technical_products SET quantity = quantity + OLD.quantity WHERE id = OLD.product_id;
    END IF;
    IF NEW.product_id IS NOT NULL THEN
      UPDATE public.technical_products SET quantity = quantity - NEW.quantity WHERE id = NEW.product_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.product_id IS NOT NULL THEN
      UPDATE public.technical_products SET quantity = quantity + OLD.quantity WHERE id = OLD.product_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_stock_sync_order_parts
  AFTER INSERT OR UPDATE OR DELETE ON public.technical_order_parts
  FOR EACH ROW EXECUTE FUNCTION public.sync_stock_on_order_parts();

-- 3. Trigger: recompute OS parts_value / total_value from sum of parts
CREATE OR REPLACE FUNCTION public.recompute_order_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_parts numeric;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  SELECT COALESCE(SUM(total_price), 0) INTO v_parts
    FROM public.technical_order_parts WHERE order_id = v_order_id;
  UPDATE public.technical_orders
    SET parts_value = v_parts,
        total_value = v_parts + COALESCE(labor_value,0) + COALESCE(shipping_value,0) + COALESCE(services_value,0)
    WHERE id = v_order_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_recompute_order_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.technical_order_parts
  FOR EACH ROW EXECUTE FUNCTION public.recompute_order_totals();

-- 4. Stock sync for sales (technical_purchase_order_items)
CREATE OR REPLACE FUNCTION public.sync_stock_on_purchase_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT order_type INTO v_type FROM public.technical_purchase_orders WHERE id = NEW.purchase_order_id;
    IF NEW.product_id IS NOT NULL THEN
      IF v_type = 'Compra' THEN
        UPDATE public.technical_products SET quantity = quantity + NEW.quantity WHERE id = NEW.product_id;
      ELSE
        UPDATE public.technical_products SET quantity = quantity - NEW.quantity WHERE id = NEW.product_id;
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT order_type INTO v_type FROM public.technical_purchase_orders WHERE id = OLD.purchase_order_id;
    IF OLD.product_id IS NOT NULL THEN
      IF v_type = 'Compra' THEN
        UPDATE public.technical_products SET quantity = quantity - OLD.quantity WHERE id = OLD.product_id;
      ELSE
        UPDATE public.technical_products SET quantity = quantity + OLD.quantity WHERE id = OLD.product_id;
      END IF;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_stock_sync_purchase_items
  AFTER INSERT OR DELETE ON public.technical_purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_stock_on_purchase_items();
