CREATE OR REPLACE FUNCTION public.create_financial_record_on_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  -- Only when status changes to approved and payment is boleto, pix or cartao
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'approved')
     AND (NEW.payment_method IN ('boleto', 'pix', 'cartao'))
  THEN
    -- Don't create duplicate
    IF NOT EXISTS (SELECT 1 FROM public.financial_records WHERE quote_id = NEW.id) THEN
      INSERT INTO public.financial_records (
        quote_id, client_name, client_id, total_amount, payment_method,
        due_date, installments_total, source, created_by, financial_status
      ) VALUES (
        NEW.id,
        NEW.client_name,
        NEW.client_id,
        COALESCE(NEW.total_amount, NEW.total, 0),
        NEW.payment_method,
        COALESCE(NEW.payment_date, CURRENT_DATE + INTERVAL '30 days'),
        COALESCE(NEW.installments, 1),
        COALESCE(NEW.source, 'manual'),
        NEW.created_by,
        'aguardando_pagamento'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;