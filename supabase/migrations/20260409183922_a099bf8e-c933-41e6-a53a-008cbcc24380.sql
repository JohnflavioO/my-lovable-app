-- Step 1: Remove duplicate trigger
DROP TRIGGER IF EXISTS trigger_create_financial_record_on_approval ON public.quotes;

-- Step 2: Fix the trigger function
CREATE OR REPLACE FUNCTION public.create_financial_record_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  resolved_client_name TEXT;
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'approved')
     AND (NEW.payment_method IN ('boleto', 'pix', 'cartao'))
  THEN
    IF NOT EXISTS (SELECT 1 FROM public.financial_records WHERE quote_id = NEW.id) THEN
      SELECT COALESCE(NULLIF(c.company_name, ''), NULLIF(c.name, ''), NULLIF(NEW.client_name, ''), 'Sem cliente')
      INTO resolved_client_name
      FROM public.clients c
      WHERE c.id = NEW.client_id;

      IF resolved_client_name IS NULL THEN
        resolved_client_name := COALESCE(NULLIF(NEW.client_name, ''), 'Sem cliente');
      END IF;

      INSERT INTO public.financial_records (
        quote_id, client_name, client_id, total_amount, payment_method,
        due_date, installments_total, source, created_by, financial_status
      ) VALUES (
        NEW.id, resolved_client_name, NEW.client_id,
        COALESCE(NEW.total_amount, NEW.total, 0), NEW.payment_method,
        COALESCE(NEW.payment_date, CURRENT_DATE + INTERVAL '30 days'),
        COALESCE(NEW.installments, 1), COALESCE(NEW.source, 'manual'),
        NEW.created_by, 'aguardando_pagamento'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Step 3: Create auto-fill trigger function for quotes
CREATE OR REPLACE FUNCTION public.auto_fill_quote_client_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (NEW.client_name IS NULL OR NEW.client_name = '') AND NEW.client_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(c.company_name, ''), NULLIF(c.name, ''), 'Sem cliente')
    INTO NEW.client_name
    FROM public.clients c
    WHERE c.id = NEW.client_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_fill_quote_client_name ON public.quotes;
CREATE TRIGGER trg_auto_fill_quote_client_name
  BEFORE INSERT OR UPDATE ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_fill_quote_client_name();

-- Step 4: Temporarily disable the check trigger to allow backfill
ALTER TABLE public.quotes DISABLE TRIGGER enforce_public_quote_update;

-- Step 5: Backfill client_name on quotes
UPDATE public.quotes q
SET client_name = sub.resolved_name
FROM (
  SELECT q2.id, COALESCE(NULLIF(c.company_name, ''), NULLIF(c.name, ''), 'Sem cliente') AS resolved_name
  FROM public.quotes q2
  JOIN public.clients c ON c.id = q2.client_id
  WHERE q2.client_name IS NULL OR q2.client_name = ''
) sub
WHERE q.id = sub.id;

-- Step 6: Re-enable the check trigger
ALTER TABLE public.quotes ENABLE TRIGGER enforce_public_quote_update;

-- Step 7: Backfill client_name on financial_records
UPDATE public.financial_records fr
SET client_name = sub.resolved_name
FROM (
  SELECT fr2.id,
    COALESCE(
      NULLIF(c.company_name, ''),
      NULLIF(c.name, ''),
      NULLIF(q.client_name, ''),
      'Sem cliente'
    ) AS resolved_name
  FROM public.financial_records fr2
  LEFT JOIN public.quotes q ON q.id = fr2.quote_id
  LEFT JOIN public.clients c ON c.id = COALESCE(fr2.client_id, q.client_id)
  WHERE fr2.client_name IS NULL OR fr2.client_name = ''
) sub
WHERE fr.id = sub.id;