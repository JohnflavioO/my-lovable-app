
-- 1. Fix public quote access: create a function that checks token from request headers
CREATE OR REPLACE FUNCTION public.get_public_quote_token()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(current_setting('request.headers', true)::json->>'x-quote-token', '')
$$;

-- 2. Drop old overly permissive policies on quotes
DROP POLICY IF EXISTS "Public can view quote by token" ON public.quotes;
DROP POLICY IF EXISTS "Public can update quote status by token" ON public.quotes;

-- 3. Create new restrictive policies that require token matching
CREATE POLICY "Public can view quote by token"
ON public.quotes
FOR SELECT
TO anon
USING (public_token IS NOT NULL AND public_token = get_public_quote_token());

CREATE POLICY "Public can update quote status by token"
ON public.quotes
FOR UPDATE
TO anon
USING (public_token IS NOT NULL AND public_token = get_public_quote_token())
WITH CHECK (public_token IS NOT NULL AND public_token = get_public_quote_token());

-- 4. Fix quote_items public access
DROP POLICY IF EXISTS "Public can view quote items by token" ON public.quote_items;

CREATE POLICY "Public can view quote items by token"
ON public.quote_items
FOR SELECT
TO anon
USING (EXISTS (
  SELECT 1 FROM public.quotes
  WHERE quotes.id = quote_items.quote_id
    AND quotes.public_token IS NOT NULL
    AND quotes.public_token = get_public_quote_token()
));

-- 5. Fix storage: delete policy needs ownership check
DROP POLICY IF EXISTS "Users can delete own quote PDFs" ON storage.objects;
CREATE POLICY "Users can delete own quote PDFs"
ON storage.objects
FOR DELETE
USING (bucket_id = 'quote-pdfs' AND auth.role() = 'authenticated' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 6. Fix storage: make quote-pdfs not publicly readable
DROP POLICY IF EXISTS "Quote PDFs are publicly accessible" ON storage.objects;
CREATE POLICY "Authenticated users can view own quote PDFs"
ON storage.objects
FOR SELECT
USING (bucket_id = 'quote-pdfs' AND auth.role() = 'authenticated');

-- 7. Fix upload policy to scope by user folder
DROP POLICY IF EXISTS "Approved users can upload quote PDFs" ON storage.objects;
CREATE POLICY "Approved users can upload quote PDFs"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'quote-pdfs' AND auth.role() = 'authenticated' AND (storage.foldername(name))[1] = auth.uid()::text);
