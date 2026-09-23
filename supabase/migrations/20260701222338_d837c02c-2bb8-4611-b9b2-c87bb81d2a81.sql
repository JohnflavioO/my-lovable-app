
CREATE OR REPLACE FUNCTION public.current_user_company_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

-- system_settings: restrict SELECT to admins
DROP POLICY IF EXISTS "system_settings readable by authenticated" ON public.system_settings;
CREATE POLICY "system_settings readable by admin"
  ON public.system_settings FOR SELECT
  USING (public.is_admin());

-- technical_clients: add company scoping
DROP POLICY IF EXISTS "Support can view clients" ON public.technical_clients;
DROP POLICY IF EXISTS "Support can update clients" ON public.technical_clients;
DROP POLICY IF EXISTS "Support can insert clients" ON public.technical_clients;
DROP POLICY IF EXISTS "Support managers delete clients" ON public.technical_clients;

CREATE POLICY "Support can view clients"
  ON public.technical_clients FOR SELECT
  USING (is_support_any() AND (company_id IS NULL OR company_id = public.current_user_company_id() OR public.current_user_company_id() IS NULL));

CREATE POLICY "Support can update clients"
  ON public.technical_clients FOR UPDATE
  USING (is_support_any() AND (company_id IS NULL OR company_id = public.current_user_company_id() OR public.current_user_company_id() IS NULL))
  WITH CHECK (is_support_any() AND (company_id IS NULL OR company_id = public.current_user_company_id() OR public.current_user_company_id() IS NULL));

CREATE POLICY "Support can insert clients"
  ON public.technical_clients FOR INSERT
  WITH CHECK (is_support_any() AND (company_id IS NULL OR company_id = public.current_user_company_id() OR public.current_user_company_id() IS NULL));

CREATE POLICY "Support managers delete clients"
  ON public.technical_clients FOR DELETE
  USING (is_support_manager() AND (company_id IS NULL OR company_id = public.current_user_company_id() OR public.current_user_company_id() IS NULL));

-- technical_orders: add company scoping (keep Public token policy intact)
DROP POLICY IF EXISTS "Support can view orders" ON public.technical_orders;
DROP POLICY IF EXISTS "Support can update orders" ON public.technical_orders;
DROP POLICY IF EXISTS "Support can insert orders" ON public.technical_orders;
DROP POLICY IF EXISTS "Support managers delete orders" ON public.technical_orders;

CREATE POLICY "Support can view orders"
  ON public.technical_orders FOR SELECT
  USING (is_support_any() AND (company_id IS NULL OR company_id = public.current_user_company_id() OR public.current_user_company_id() IS NULL));

CREATE POLICY "Support can update orders"
  ON public.technical_orders FOR UPDATE
  USING (is_support_any() AND (company_id IS NULL OR company_id = public.current_user_company_id() OR public.current_user_company_id() IS NULL))
  WITH CHECK (is_support_any() AND (company_id IS NULL OR company_id = public.current_user_company_id() OR public.current_user_company_id() IS NULL));

CREATE POLICY "Support can insert orders"
  ON public.technical_orders FOR INSERT
  WITH CHECK (is_support_any() AND (company_id IS NULL OR company_id = public.current_user_company_id() OR public.current_user_company_id() IS NULL));

CREATE POLICY "Support managers delete orders"
  ON public.technical_orders FOR DELETE
  USING (is_support_manager() AND (company_id IS NULL OR company_id = public.current_user_company_id() OR public.current_user_company_id() IS NULL));

-- technical_products: add company scoping
DROP POLICY IF EXISTS "Support can view products" ON public.technical_products;
DROP POLICY IF EXISTS "Support can update products" ON public.technical_products;
DROP POLICY IF EXISTS "Support can insert products" ON public.technical_products;
DROP POLICY IF EXISTS "Support managers delete products" ON public.technical_products;

CREATE POLICY "Support can view products"
  ON public.technical_products FOR SELECT
  USING (is_support_any() AND (company_id IS NULL OR company_id = public.current_user_company_id() OR public.current_user_company_id() IS NULL));

CREATE POLICY "Support can update products"
  ON public.technical_products FOR UPDATE
  USING (is_support_any() AND (company_id IS NULL OR company_id = public.current_user_company_id() OR public.current_user_company_id() IS NULL))
  WITH CHECK (is_support_any() AND (company_id IS NULL OR company_id = public.current_user_company_id() OR public.current_user_company_id() IS NULL));

CREATE POLICY "Support can insert products"
  ON public.technical_products FOR INSERT
  WITH CHECK (is_support_any() AND (company_id IS NULL OR company_id = public.current_user_company_id() OR public.current_user_company_id() IS NULL));

CREATE POLICY "Support managers delete products"
  ON public.technical_products FOR DELETE
  USING (is_support_manager() AND (company_id IS NULL OR company_id = public.current_user_company_id() OR public.current_user_company_id() IS NULL));
