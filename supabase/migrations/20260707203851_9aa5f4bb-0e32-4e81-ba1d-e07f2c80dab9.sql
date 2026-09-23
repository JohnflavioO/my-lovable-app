
ALTER TABLE public.technical_orders
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_proof_url TEXT,
  ADD COLUMN IF NOT EXISTS shipping_method TEXT,
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC NOT NULL DEFAULT 0;

DROP POLICY IF EXISTS "Authenticated read budget-proofs" ON storage.objects;
CREATE POLICY "Authenticated read budget-proofs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'budget-proofs');

DROP POLICY IF EXISTS "Authenticated write budget-proofs" ON storage.objects;
CREATE POLICY "Authenticated write budget-proofs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'budget-proofs');

DROP POLICY IF EXISTS "Authenticated update budget-proofs" ON storage.objects;
CREATE POLICY "Authenticated update budget-proofs"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'budget-proofs')
WITH CHECK (bucket_id = 'budget-proofs');

DROP POLICY IF EXISTS "Authenticated delete budget-proofs" ON storage.objects;
CREATE POLICY "Authenticated delete budget-proofs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'budget-proofs');
