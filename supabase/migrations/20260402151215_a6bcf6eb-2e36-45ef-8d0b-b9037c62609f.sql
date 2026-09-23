
-- Create is_gestor function
CREATE OR REPLACE FUNCTION public.is_gestor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'gestor'
  )
$$;

-- QUOTES: Drop old policies and create new ones
DROP POLICY IF EXISTS "Users can view own quotes, admins all" ON public.quotes;
DROP POLICY IF EXISTS "Users can update own quotes, admins all" ON public.quotes;

CREATE POLICY "Users can view quotes by role"
ON public.quotes FOR SELECT TO authenticated
USING (is_approved() AND (is_gestor() OR created_by = auth.uid()));

CREATE POLICY "Users can update quotes by role"
ON public.quotes FOR UPDATE TO authenticated
USING (is_approved() AND (is_gestor() OR created_by = auth.uid()));

CREATE POLICY "Users can delete own quotes or gestor"
ON public.quotes FOR DELETE TO authenticated
USING (is_approved() AND (is_gestor() OR created_by = auth.uid()));

-- CLIENTS: Drop old policies and create new ones
DROP POLICY IF EXISTS "Users can view own clients, admins all" ON public.clients;
DROP POLICY IF EXISTS "Users can update own clients, admins all" ON public.clients;

CREATE POLICY "Users can view clients by role"
ON public.clients FOR SELECT TO authenticated
USING (is_approved() AND (is_gestor() OR created_by = auth.uid()));

CREATE POLICY "Users can update clients by role"
ON public.clients FOR UPDATE TO authenticated
USING (is_approved() AND (is_gestor() OR created_by = auth.uid()));

CREATE POLICY "Users can delete own clients or gestor"
ON public.clients FOR DELETE TO authenticated
USING (is_approved() AND (is_gestor() OR created_by = auth.uid()));

-- QUOTE_ITEMS: Drop old policies and create new ones
DROP POLICY IF EXISTS "Users can view own quote items, admins all" ON public.quote_items;
DROP POLICY IF EXISTS "Users can update own quote items, admins all" ON public.quote_items;
DROP POLICY IF EXISTS "Users can delete own quote items, admins all" ON public.quote_items;

CREATE POLICY "Users can view quote items by role"
ON public.quote_items FOR SELECT TO authenticated
USING (is_approved() AND (is_gestor() OR EXISTS (
  SELECT 1 FROM quotes WHERE quotes.id = quote_items.quote_id AND quotes.created_by = auth.uid()
)));

CREATE POLICY "Users can update quote items by role"
ON public.quote_items FOR UPDATE TO authenticated
USING (is_approved() AND (is_gestor() OR EXISTS (
  SELECT 1 FROM quotes WHERE quotes.id = quote_items.quote_id AND quotes.created_by = auth.uid()
)));

CREATE POLICY "Users can delete quote items by role"
ON public.quote_items FOR DELETE TO authenticated
USING (is_approved() AND (is_gestor() OR EXISTS (
  SELECT 1 FROM quotes WHERE quotes.id = quote_items.quote_id AND quotes.created_by = auth.uid()
)));
