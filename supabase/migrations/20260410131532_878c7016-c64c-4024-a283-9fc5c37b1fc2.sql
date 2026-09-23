
-- When a quote status changes FROM 'approved' to something else,
-- delete the corresponding logistics record (and its action history via cascade)
CREATE OR REPLACE FUNCTION public.remove_logistics_on_unapproval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (TG_OP = 'UPDATE'
      AND OLD.status = 'approved'
      AND NEW.status IS DISTINCT FROM 'approved')
  THEN
    DELETE FROM public.logistics_action_history
    WHERE logistics_record_id IN (
      SELECT id FROM public.logistics_records WHERE quote_id = NEW.id
    );
    DELETE FROM public.logistics_records WHERE quote_id = NEW.id;
    -- Also remove financial record if exists
    DELETE FROM public.financial_action_history
    WHERE financial_record_id IN (
      SELECT id FROM public.financial_records WHERE quote_id = NEW.id
    );
    DELETE FROM public.financial_records WHERE quote_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_remove_logistics_on_unapproval
BEFORE UPDATE ON public.quotes
FOR EACH ROW
EXECUTE FUNCTION public.remove_logistics_on_unapproval();
