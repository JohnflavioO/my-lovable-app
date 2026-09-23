
CREATE OR REPLACE FUNCTION public.set_quote_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.created_by IS NOT NULL THEN
    SELECT p.company_id INTO NEW.company_id
    FROM public.profiles p
    WHERE p.user_id = NEW.created_by
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_quote_company_id ON public.quotes;
CREATE TRIGGER trg_set_quote_company_id
BEFORE INSERT ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.set_quote_company_id();

ALTER TABLE public.quotes DISABLE TRIGGER trg_restrict_public_quote_update;
ALTER TABLE public.quotes DISABLE TRIGGER enforce_public_quote_update;

UPDATE public.quotes q
SET company_id = p.company_id
FROM public.profiles p
WHERE p.user_id = q.created_by
  AND q.company_id IS NULL
  AND p.company_id IS NOT NULL;

ALTER TABLE public.quotes ENABLE TRIGGER trg_restrict_public_quote_update;
ALTER TABLE public.quotes ENABLE TRIGGER enforce_public_quote_update;
