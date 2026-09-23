-- Allow Admins and Gestores to view all quotes
CREATE POLICY "Admins and Gestores can view all quotes"
ON public.quotes
FOR SELECT
USING (is_admin() OR is_gestor());

-- Allow Admins and Gestores to update all quotes
CREATE POLICY "Admins and Gestores can update all quotes"
ON public.quotes
FOR UPDATE
USING (is_admin() OR is_gestor());

-- Ensure the existing policies are still there but these ones will override/complement
-- Note: Supabase policies are OR-ed by default unless they are RESTRICTIVE.
-- These are PERMISSIVE (default), so they add access.
