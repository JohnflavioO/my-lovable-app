
ALTER TABLE public.generated_contracts
  ADD COLUMN IF NOT EXISTS signed_file_url TEXT,
  ADD COLUMN IF NOT EXISTS signed_file_name TEXT,
  ADD COLUMN IF NOT EXISTS signed_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signed_uploaded_by UUID REFERENCES auth.users(id);

-- Storage RLS for contracts bucket (signed/ folder)
CREATE POLICY "Authenticated can view signed contracts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'contracts');

CREATE POLICY "Authenticated can upload signed contracts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'contracts');

CREATE POLICY "Authenticated can update signed contracts"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'contracts');

CREATE POLICY "Authenticated can delete signed contracts"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'contracts');
