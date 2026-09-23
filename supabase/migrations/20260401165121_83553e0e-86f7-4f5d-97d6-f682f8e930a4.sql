
-- Helper function to check admin without recursion
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
$$;

-- Helper function to check approved
CREATE OR REPLACE FUNCTION public.is_approved()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_approvals
    WHERE user_id = auth.uid() AND status = 'approved'
  )
$$;

-- QUOTES: drop old policies, add new ones
DROP POLICY IF EXISTS "Approved users can view quotes" ON public.quotes;
DROP POLICY IF EXISTS "Approved users can insert quotes" ON public.quotes;
DROP POLICY IF EXISTS "Approved users can update quotes" ON public.quotes;

CREATE POLICY "Users can view own quotes, admins all"
ON public.quotes FOR SELECT TO authenticated
USING (public.is_approved() AND (public.is_admin() OR created_by = auth.uid()));

CREATE POLICY "Approved users can insert quotes"
ON public.quotes FOR INSERT TO authenticated
WITH CHECK (public.is_approved());

CREATE POLICY "Users can update own quotes, admins all"
ON public.quotes FOR UPDATE TO authenticated
USING (public.is_approved() AND (public.is_admin() OR created_by = auth.uid()));

-- CLIENTS: drop old, add new with created_by isolation
DROP POLICY IF EXISTS "Approved users can view clients" ON public.clients;
DROP POLICY IF EXISTS "Approved users can insert clients" ON public.clients;
DROP POLICY IF EXISTS "Approved users can update clients" ON public.clients;

CREATE POLICY "Users can view own clients, admins all"
ON public.clients FOR SELECT TO authenticated
USING (public.is_approved() AND (public.is_admin() OR created_by = auth.uid()));

CREATE POLICY "Approved users can insert clients"
ON public.clients FOR INSERT TO authenticated
WITH CHECK (public.is_approved());

CREATE POLICY "Users can update own clients, admins all"
ON public.clients FOR UPDATE TO authenticated
USING (public.is_approved() AND (public.is_admin() OR created_by = auth.uid()));

-- QUOTE_ITEMS: isolate via quote ownership
DROP POLICY IF EXISTS "Approved users can view quote items" ON public.quote_items;
DROP POLICY IF EXISTS "Approved users can insert quote items" ON public.quote_items;
DROP POLICY IF EXISTS "Approved users can update quote items" ON public.quote_items;
DROP POLICY IF EXISTS "Approved users can delete quote items" ON public.quote_items;

CREATE POLICY "Users can view own quote items, admins all"
ON public.quote_items FOR SELECT TO authenticated
USING (public.is_approved() AND (public.is_admin() OR EXISTS (
  SELECT 1 FROM public.quotes WHERE quotes.id = quote_items.quote_id AND quotes.created_by = auth.uid()
)));

CREATE POLICY "Approved users can insert quote items"
ON public.quote_items FOR INSERT TO authenticated
WITH CHECK (public.is_approved());

CREATE POLICY "Users can update own quote items, admins all"
ON public.quote_items FOR UPDATE TO authenticated
USING (public.is_approved() AND (public.is_admin() OR EXISTS (
  SELECT 1 FROM public.quotes WHERE quotes.id = quote_items.quote_id AND quotes.created_by = auth.uid()
)));

CREATE POLICY "Users can delete own quote items, admins all"
ON public.quote_items FOR DELETE TO authenticated
USING (public.is_approved() AND (public.is_admin() OR EXISTS (
  SELECT 1 FROM public.quotes WHERE quotes.id = quote_items.quote_id AND quotes.created_by = auth.uid()
)));
