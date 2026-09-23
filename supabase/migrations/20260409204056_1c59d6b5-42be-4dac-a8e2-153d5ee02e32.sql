
-- Allow logistica to view all quotes (needed to see approved quotes)
CREATE POLICY "Logistica can view all quotes"
ON public.quotes FOR SELECT
TO authenticated
USING (public.is_logistica());

-- Allow logistica to view all quote items
CREATE POLICY "Logistica can view all quote items"
ON public.quote_items FOR SELECT
TO authenticated
USING (public.is_logistica());

-- Allow logistica to view all clients (needed for PDF and details)
CREATE POLICY "Logistica can view all clients"
ON public.clients FOR SELECT
TO authenticated
USING (public.is_logistica());

-- Allow logistica to view profiles (needed for seller names)
CREATE POLICY "Logistica can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.is_logistica());
