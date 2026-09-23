
-- ============ ROLES HELPERS ============
CREATE OR REPLACE FUNCTION public.is_support_tech()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'support_tech');
END; $$;

CREATE OR REPLACE FUNCTION public.is_support_manager()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'support_manager');
END; $$;

CREATE OR REPLACE FUNCTION public.is_support_any()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_support_tech() OR public.is_support_manager();
$$;

-- ============ OS NUMBER SEQUENCE ============
CREATE SEQUENCE IF NOT EXISTS public.technical_os_number_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_technical_os_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN 'OS-' || EXTRACT(YEAR FROM now())::text || '-' || LPAD(nextval('public.technical_os_number_seq')::text, 4, '0');
END; $$;

-- ============ BRANDS ============
CREATE TABLE public.technical_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.technical_brands (name) VALUES ('Aputure'),('Amaran'),('Astera'),('Creamsource'),('Outros');

-- ============ PRODUCTS / STOCK ============
CREATE TABLE public.technical_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text,
  manufacturer text,
  compatibility text,
  location text,
  quantity integer NOT NULL DEFAULT 0,
  min_quantity integer NOT NULL DEFAULT 0,
  cost numeric NOT NULL DEFAULT 0,
  price numeric NOT NULL DEFAULT 0,
  notes text,
  image_url text,
  category text,
  company_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ CLIENTS ============
CREATE TABLE public.technical_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cpf_cnpj text,
  phone text,
  whatsapp text,
  email text,
  address text,
  notes text,
  equipments jsonb DEFAULT '[]'::jsonb,
  company_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ SERVICE ORDERS ============
CREATE TABLE public.technical_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_number text NOT NULL UNIQUE DEFAULT public.generate_technical_os_number(),
  client_id uuid REFERENCES public.technical_clients(id) ON DELETE SET NULL,
  client_name text NOT NULL DEFAULT '',
  equipment text,
  brand text,
  model text,
  serial text,
  reported_defect text,
  technical_diagnosis text,
  technician_id uuid,
  technician_name text,
  estimated_date date,
  warranty text,
  parts_value numeric NOT NULL DEFAULT 0,
  labor_value numeric NOT NULL DEFAULT 0,
  shipping_value numeric NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'recebido',
  photos jsonb DEFAULT '[]'::jsonb,
  attachments jsonb DEFAULT '[]'::jsonb,
  public_token text DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  company_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_technical_orders_status ON public.technical_orders(status);
CREATE INDEX idx_technical_orders_client ON public.technical_orders(client_id);
CREATE INDEX idx_technical_orders_token ON public.technical_orders(public_token);

-- ============ STATUS HISTORY ============
CREATE TABLE public.technical_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.technical_orders(id) ON DELETE CASCADE,
  previous_status text,
  new_status text NOT NULL,
  notes text,
  performed_by uuid,
  performed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ TRIGGERS ============
CREATE TRIGGER trg_technical_products_updated_at BEFORE UPDATE ON public.technical_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_technical_clients_updated_at BEFORE UPDATE ON public.technical_clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_technical_orders_updated_at BEFORE UPDATE ON public.technical_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-log status changes
CREATE OR REPLACE FUNCTION public.log_technical_order_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _name text;
BEGIN
  IF (TG_OP = 'INSERT') OR (OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT full_name INTO _name FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
    INSERT INTO public.technical_status_history (order_id, previous_status, new_status, performed_by, performed_by_name)
    VALUES (NEW.id, CASE WHEN TG_OP='UPDATE' THEN OLD.status ELSE NULL END, NEW.status, auth.uid(), _name);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_technical_orders_status_log
  AFTER INSERT OR UPDATE OF status ON public.technical_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_technical_order_status();

-- ============ RLS ============
ALTER TABLE public.technical_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_status_history ENABLE ROW LEVEL SECURITY;

-- BRANDS: support users can read; managers manage
CREATE POLICY "Support can view brands" ON public.technical_brands FOR SELECT TO authenticated USING (public.is_support_any());
CREATE POLICY "Support managers manage brands" ON public.technical_brands FOR ALL TO authenticated USING (public.is_support_manager()) WITH CHECK (public.is_support_manager());

-- PRODUCTS
CREATE POLICY "Support can view products" ON public.technical_products FOR SELECT TO authenticated USING (public.is_support_any());
CREATE POLICY "Support can insert products" ON public.technical_products FOR INSERT TO authenticated WITH CHECK (public.is_support_any());
CREATE POLICY "Support can update products" ON public.technical_products FOR UPDATE TO authenticated USING (public.is_support_any());
CREATE POLICY "Support managers delete products" ON public.technical_products FOR DELETE TO authenticated USING (public.is_support_manager());

-- CLIENTS
CREATE POLICY "Support can view clients" ON public.technical_clients FOR SELECT TO authenticated USING (public.is_support_any());
CREATE POLICY "Support can insert clients" ON public.technical_clients FOR INSERT TO authenticated WITH CHECK (public.is_support_any());
CREATE POLICY "Support can update clients" ON public.technical_clients FOR UPDATE TO authenticated USING (public.is_support_any());
CREATE POLICY "Support managers delete clients" ON public.technical_clients FOR DELETE TO authenticated USING (public.is_support_manager());

-- ORDERS
CREATE POLICY "Support can view orders" ON public.technical_orders FOR SELECT TO authenticated USING (public.is_support_any());
CREATE POLICY "Support can insert orders" ON public.technical_orders FOR INSERT TO authenticated WITH CHECK (public.is_support_any());
CREATE POLICY "Support can update orders" ON public.technical_orders FOR UPDATE TO authenticated USING (public.is_support_any());
CREATE POLICY "Support managers delete orders" ON public.technical_orders FOR DELETE TO authenticated USING (public.is_support_manager());

-- Public tracking by token
CREATE POLICY "Public can view order by token" ON public.technical_orders FOR SELECT TO anon
  USING (public_token IS NOT NULL AND public_token = public.get_public_quote_token());

-- STATUS HISTORY
CREATE POLICY "Support can view status history" ON public.technical_status_history FOR SELECT TO authenticated USING (public.is_support_any());
CREATE POLICY "Support can insert status history" ON public.technical_status_history FOR INSERT TO authenticated WITH CHECK (public.is_support_any());
CREATE POLICY "Public can view status by token" ON public.technical_status_history FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.technical_orders o WHERE o.id = order_id AND o.public_token = public.get_public_quote_token()));
