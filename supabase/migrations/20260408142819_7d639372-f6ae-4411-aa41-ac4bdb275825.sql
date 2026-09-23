-- Fix storage policy: require approved status for uploads
DROP POLICY IF EXISTS "Approved users can upload quote PDFs" ON storage.objects;
CREATE POLICY "Approved users can upload quote PDFs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'quote-pdfs'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.user_approvals
    WHERE user_id = auth.uid() AND status = 'approved'
  )
);

-- Fix admin self-approval
DROP POLICY IF EXISTS "Admins can update approvals" ON public.user_approvals;
CREATE POLICY "Admins can update approvals"
ON public.user_approvals FOR UPDATE TO authenticated
USING (
  is_admin() AND user_id <> auth.uid()
);