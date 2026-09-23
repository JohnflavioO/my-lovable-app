
-- Add nf_pdf_url column to logistics_records
ALTER TABLE public.logistics_records ADD COLUMN IF NOT EXISTS nf_pdf_url text;

-- Create storage bucket for NF PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('nf-pdfs', 'nf-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: logistica can upload
CREATE POLICY "Logistica can upload NF PDFs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'nf-pdfs' AND (SELECT public.is_logistica()));

-- Logistica can update (replace)
CREATE POLICY "Logistica can update NF PDFs"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'nf-pdfs' AND (SELECT public.is_logistica()));

-- Logistica can delete NF PDFs
CREATE POLICY "Logistica can delete NF PDFs"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'nf-pdfs' AND (SELECT public.is_logistica()));

-- All authenticated can view/download
CREATE POLICY "Authenticated can view NF PDFs"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'nf-pdfs' AND (SELECT public.is_approved()));
