
-- Drop overly broad policy
DROP POLICY IF EXISTS "Authenticated can view NF PDFs" ON storage.objects;

-- Restricted: logistica, gestor, admin can view all NF PDFs
CREATE POLICY "Logistica gestor admin can view NF PDFs"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'nf-pdfs' AND (
  (SELECT public.is_logistica()) OR
  (SELECT public.is_gestor()) OR
  (SELECT public.is_admin())
));

-- Sellers can view NF PDFs for their own quotes
CREATE POLICY "Sellers can view own quote NF PDFs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'nf-pdfs' AND
  (SELECT public.is_approved()) AND
  EXISTS (
    SELECT 1 FROM public.logistics_records lr
    JOIN public.quotes q ON q.id = lr.quote_id
    WHERE q.created_by = auth.uid()
      AND lr.nf_pdf_url = storage.objects.name
  )
);
