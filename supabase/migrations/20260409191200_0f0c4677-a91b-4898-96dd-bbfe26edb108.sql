-- Step 1: Update the approval trigger to check payment_status
CREATE OR REPLACE FUNCTION public.create_financial_record_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  resolved_client_name TEXT;
  resolved_status TEXT;
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

      -- If payment_status is already liquidado, mark financial record as pago
      IF NEW.payment_status = 'liquidado' THEN
        resolved_status := 'pago';
      ELSE
        resolved_status := 'aguardando_pagamento';
      END IF;

      INSERT INTO public.financial_records (
        quote_id, client_name, client_id, total_amount, payment_method,
        due_date, installments_total, source, created_by, financial_status,
        amount_paid, paid_date
      ) VALUES (
        NEW.id, resolved_client_name, NEW.client_id,
        COALESCE(NEW.total_amount, NEW.total, 0), NEW.payment_method,
        COALESCE(NEW.payment_date, CURRENT_DATE + INTERVAL '30 days'),
        COALESCE(NEW.installments, 1), COALESCE(NEW.source, 'manual'),
        NEW.created_by, resolved_status,
        CASE WHEN NEW.payment_status = 'liquidado' THEN COALESCE(NEW.total_amount, NEW.total, 0) ELSE 0 END,
        CASE WHEN NEW.payment_status = 'liquidado' THEN CURRENT_DATE ELSE NULL END
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Step 2: Create trigger to sync payment_status changes to financial_records
CREATE OR REPLACE FUNCTION public.sync_payment_status_to_financial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- When quote payment_status changes to liquidado, mark financial record as pago
  IF (TG_OP = 'UPDATE' AND OLD.payment_status IS DISTINCT FROM NEW.payment_status AND NEW.payment_status = 'liquidado') THEN
    UPDATE public.financial_records
    SET financial_status = 'pago',
        amount_paid = total_amount,
        paid_date = CURRENT_DATE,
        updated_at = now()
    WHERE quote_id = NEW.id
      AND financial_status NOT IN ('pago', 'cancelado');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_payment_status ON public.quotes;
CREATE TRIGGER trg_sync_payment_status
  AFTER UPDATE ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_payment_status_to_financial();