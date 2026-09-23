
-- Scope NF PDFs SELECT to same company via logistics_records -> quotes.company_id
DROP POLICY IF EXISTS "Logistica gestor admin can view NF PDFs" ON storage.objects;
CREATE POLICY "Logistica gestor admin can view NF PDFs"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'nf-pdfs'
  AND (public.is_logistica() OR public.is_gestor() OR public.is_admin())
  AND EXISTS (
    SELECT 1
    FROM public.logistics_records lr
    JOIN public.quotes q ON q.id = lr.quote_id
    WHERE lr.nf_pdf_url = storage.objects.name
      AND (
        public.is_admin()
        OR q.company_id = public.current_user_company_id()
      )
  )
);

-- Scope quote-pdfs SELECT for gestors to same company via quotes.created_by -> profiles.company_id
DROP POLICY IF EXISTS "Gestors can view all quote PDFs" ON storage.objects;
CREATE POLICY "Gestors can view quote PDFs in their company"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'quote-pdfs'
  AND public.is_gestor()
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id::text = (storage.foldername(storage.objects.name))[1]
      AND p.company_id = public.current_user_company_id()
  )
);
