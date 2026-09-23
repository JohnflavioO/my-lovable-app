
-- Demonstration tracking fields
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS demonstration_start_date date,
  ADD COLUMN IF NOT EXISTS demonstration_end_date date;

CREATE INDEX IF NOT EXISTS idx_quotes_demonstration_end_date
  ON public.quotes (demonstration_end_date)
  WHERE is_demonstration = true;

-- Trigger: keep demonstration dates consistent with the flag
CREATE OR REPLACE FUNCTION public.handle_demonstration_dates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_demonstration = true THEN
    -- On first marking, fill defaults (start = today, end = +30 days)
    IF NEW.demonstration_start_date IS NULL THEN
      NEW.demonstration_start_date := CURRENT_DATE;
    END IF;
    IF NEW.demonstration_end_date IS NULL THEN
      NEW.demonstration_end_date := NEW.demonstration_start_date + INTERVAL '30 days';
    END IF;
  ELSE
    -- When unmarked, clear dates
    NEW.demonstration_start_date := NULL;
    NEW.demonstration_end_date := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotes_demonstration_dates ON public.quotes;
CREATE TRIGGER trg_quotes_demonstration_dates
  BEFORE INSERT OR UPDATE OF is_demonstration, demonstration_start_date, demonstration_end_date
  ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_demonstration_dates();

-- When demonstration is turned off (or quote deleted), clean pending demo notifications
CREATE OR REPLACE FUNCTION public.cleanup_demonstration_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.is_demonstration = true
     AND (NEW.is_demonstration = false OR NEW.is_demonstration IS NULL)
  THEN
    DELETE FROM public.notifications
    WHERE related_quote_id = NEW.id
      AND type LIKE 'demonstration_%'
      AND is_read = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_demo_notifications ON public.quotes;
CREATE TRIGGER trg_cleanup_demo_notifications
  AFTER UPDATE OF is_demonstration ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_demonstration_notifications();

-- Allow the daily cron / edge function to insert notifications for demo reminders.
-- The existing policy only allows admins/gestores; add a complementary policy for the service role.
DROP POLICY IF EXISTS "Service role can insert demo notifications" ON public.notifications;
CREATE POLICY "Service role can insert demo notifications"
  ON public.notifications
  FOR INSERT
  TO service_role
  WITH CHECK (true);
