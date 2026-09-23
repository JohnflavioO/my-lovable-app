
-- Add thumbnail support columns
ALTER TABLE public.help_videos
  ADD COLUMN IF NOT EXISTS video_type text,
  ADD COLUMN IF NOT EXISTS video_id text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS custom_thumbnail_url text;

-- Storage policies for help-thumbnails (read public, write gestor/admin)
CREATE POLICY "Public read help thumbnails"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'help-thumbnails');

CREATE POLICY "Gestor/admin upload help thumbnails"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'help-thumbnails' AND (public.is_gestor() OR public.is_admin()));

CREATE POLICY "Gestor/admin update help thumbnails"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'help-thumbnails' AND (public.is_gestor() OR public.is_admin()));

CREATE POLICY "Gestor/admin delete help thumbnails"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'help-thumbnails' AND (public.is_gestor() OR public.is_admin()));
