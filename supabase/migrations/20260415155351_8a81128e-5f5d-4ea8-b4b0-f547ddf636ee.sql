CREATE OR REPLACE FUNCTION public.validate_quote_client_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.client_id IS NOT DISTINCT FROM OLD.client_id THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = NEW.client_id
      AND c.created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Você só pode vincular orçamentos aos seus próprios clientes';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_quote_client_owner ON public.quotes;

CREATE TRIGGER validate_quote_client_owner
BEFORE INSERT OR UPDATE OF client_id ON public.quotes
FOR EACH ROW
EXECUTE FUNCTION public.validate_quote_client_owner();