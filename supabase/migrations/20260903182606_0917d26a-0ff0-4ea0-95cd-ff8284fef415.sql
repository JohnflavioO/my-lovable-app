CREATE OR REPLACE FUNCTION public.prevent_duplicate_products()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := nullif(lower(btrim(coalesce(NEW.code, ''))), '');
  v_sku text := nullif(lower(btrim(coalesce(NEW.sku, ''))), '');
  v_name text := nullif(lower(btrim(coalesce(NEW.name, ''))), '');
  v_brand text := lower(btrim(coalesce(NEW.brand, '')));
  v_exists boolean;
BEGIN
  IF v_code IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND p.company_id IS NOT DISTINCT FROM NEW.company_id
        AND lower(btrim(coalesce(p.code, ''))) = v_code
    ) INTO v_exists;
    IF v_exists THEN
      RAISE EXCEPTION 'Produto duplicado: já existe um produto com o código "%".', btrim(NEW.code)
        USING ERRCODE = '23505';
    END IF;
  END IF;

  IF v_sku IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND p.company_id IS NOT DISTINCT FROM NEW.company_id
        AND lower(btrim(coalesce(p.sku, ''))) = v_sku
    ) INTO v_exists;
    IF v_exists THEN
      RAISE EXCEPTION 'Produto duplicado: já existe um produto com o SKU "%".', btrim(NEW.sku)
        USING ERRCODE = '23505';
    END IF;
  END IF;

  IF v_name IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND p.company_id IS NOT DISTINCT FROM NEW.company_id
        AND lower(btrim(coalesce(p.name, ''))) = v_name
        AND lower(btrim(coalesce(p.brand, ''))) = v_brand
    ) INTO v_exists;
    IF v_exists THEN
      RAISE EXCEPTION 'Produto duplicado: já existe um produto com o nome "%" para esta marca.', btrim(NEW.name)
        USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_products ON public.products;
CREATE TRIGGER trg_prevent_duplicate_products
BEFORE INSERT OR UPDATE OF name, brand, code, sku ON public.products
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_products();

CREATE INDEX IF NOT EXISTS idx_products_dup_code ON public.products (company_id, lower(btrim(code)));
CREATE INDEX IF NOT EXISTS idx_products_dup_sku ON public.products (company_id, lower(btrim(sku)));
CREATE INDEX IF NOT EXISTS idx_products_dup_name ON public.products (company_id, lower(btrim(name)), lower(btrim(brand)));