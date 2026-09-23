
-- Add avatar_url to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text DEFAULT NULL;

-- Create avatars storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Avatars storage policies
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Create quote-pdfs storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('quote-pdfs', 'quote-pdfs', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Quote PDFs are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'quote-pdfs');

CREATE POLICY "Approved users can upload quote PDFs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'quote-pdfs' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete own quote PDFs"
ON storage.objects FOR DELETE
USING (bucket_id = 'quote-pdfs' AND auth.role() = 'authenticated');
