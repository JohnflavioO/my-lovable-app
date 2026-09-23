-- Backfill company_id on legacy technical records and profiles to the default company,
-- restoring visibility after the RLS NULL-bypass removal.
DO $$
DECLARE
  default_company uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  UPDATE public.profiles SET company_id = default_company WHERE company_id IS NULL;
  UPDATE public.technical_products SET company_id = default_company WHERE company_id IS NULL;
  UPDATE public.technical_clients  SET company_id = default_company WHERE company_id IS NULL;
  UPDATE public.technical_orders   SET company_id = default_company WHERE company_id IS NULL;
END $$;

-- Ensure future inserts always get a company_id even when the client omits it.
CREATE OR REPLACE FUNCTION public.set_company_id_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.profiles WHERE user_id = auth.uid();
    IF NEW.company_id IS NULL THEN
      NEW.company_id := '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_company_technical_products ON public.technical_products;
CREATE TRIGGER trg_set_company_technical_products
  BEFORE INSERT ON public.technical_products
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_profile();

DROP TRIGGER IF EXISTS trg_set_company_technical_clients ON public.technical_clients;
CREATE TRIGGER trg_set_company_technical_clients
  BEFORE INSERT ON public.technical_clients
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_profile();

DROP TRIGGER IF EXISTS trg_set_company_technical_orders ON public.technical_orders;
CREATE TRIGGER trg_set_company_technical_orders
  BEFORE INSERT ON public.technical_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_profile();