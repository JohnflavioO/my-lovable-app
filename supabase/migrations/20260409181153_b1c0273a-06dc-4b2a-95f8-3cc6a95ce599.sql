-- 1. Attach the trigger to quotes table
CREATE TRIGGER trigger_create_financial_record_on_approval
  AFTER UPDATE ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.create_financial_record_on_approval();

-- 2. Allow financeiro to view all profiles (needed for seller grouping)
CREATE POLICY "Financeiro can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (is_financeiro());

-- 3. Backfill financial_records for already-approved quotes that are missing
INSERT INTO public.financial_records (quote_id, client_name, client_id, total_amount, payment_method, due_date, installments_total, source, created_by, financial_status)
SELECT 
  q.id,
  q.client_name,
  q.client_id,
  COALESCE(q.total_amount, q.total, 0),
  q.payment_method,
  COALESCE(q.payment_date, CURRENT_DATE + INTERVAL '30 days'),
  COALESCE(q.installments, 1),
  COALESCE(q.source, 'manual'),
  q.created_by,
  'aguardando_pagamento'
FROM public.quotes q
WHERE q.status = 'approved'
  AND q.payment_method IN ('boleto', 'pix', 'cartao')
  AND NOT EXISTS (SELECT 1 FROM public.financial_records fr WHERE fr.quote_id = q.id);