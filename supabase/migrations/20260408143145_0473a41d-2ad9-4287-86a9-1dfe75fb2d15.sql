-- Allow gestors to read all quote PDFs
CREATE POLICY "Gestors can view all quote PDFs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'quote-pdfs'
  AND is_gestor()
);