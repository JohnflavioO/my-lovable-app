
CREATE OR REPLACE FUNCTION public.set_technical_products_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.current_user_company_id();
  END IF;
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_technical_products_company ON public.technical_products;
CREATE TRIGGER trg_set_technical_products_company
BEFORE INSERT ON public.technical_products
FOR EACH ROW EXECUTE FUNCTION public.set_technical_products_company();

-- Backfill any existing rows without company_id (single-tenant deployment)
UPDATE public.technical_products
SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;
