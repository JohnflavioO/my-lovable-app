
-- Fix 1: Restrict technical_maintenances SELECT to support/admin/gestor
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.technical_maintenances;
CREATE POLICY "Support and managers can view maintenance"
  ON public.technical_maintenances
  FOR SELECT
  TO authenticated
  USING (public.is_support_any() OR public.is_admin() OR public.is_gestor());

-- Fix 2: Harden NF PDF storage SELECT policy — require non-null nf_pdf_url and exact object name match
DROP POLICY IF EXISTS "Sellers can view own quote NF PDFs" ON storage.objects;
CREATE POLICY "Sellers can view own quote NF PDFs"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'nf-pdfs'
    AND public.is_approved()
    AND EXISTS (
      SELECT 1
      FROM public.logistics_records lr
      JOIN public.quotes q ON q.id = lr.quote_id
      WHERE q.created_by = auth.uid()
        AND lr.nf_pdf_url IS NOT NULL
        AND lr.nf_pdf_url = objects.name
    )
  );
