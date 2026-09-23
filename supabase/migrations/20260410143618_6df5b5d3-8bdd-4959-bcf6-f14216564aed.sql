
-- Drop existing trigger
DROP TRIGGER IF EXISTS trg_create_logistics_on_approval ON public.quotes;

-- Recreate the function to handle both INSERT and UPDATE
CREATE OR REPLACE FUNCTION public.create_logistics_on_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Handle INSERT: if a new quote is created with status 'approved'
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved') THEN
    IF NOT EXISTS (SELECT 1 FROM public.logistics_records WHERE quote_id = NEW.id) THEN
      INSERT INTO public.logistics_records (quote_id, logistics_status)
      VALUES (NEW.id, 'aguardando_entrada');
    END IF;
  END IF;

  -- Handle UPDATE: if status changes to 'approved'
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'approved') THEN
    IF NOT EXISTS (SELECT 1 FROM public.logistics_records WHERE quote_id = NEW.id) THEN
      INSERT INTO public.logistics_records (quote_id, logistics_status)
      VALUES (NEW.id, 'aguardando_entrada');
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Recreate trigger for BOTH INSERT and UPDATE
CREATE TRIGGER trg_create_logistics_on_approval
  AFTER INSERT OR UPDATE ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.create_logistics_on_approval();
