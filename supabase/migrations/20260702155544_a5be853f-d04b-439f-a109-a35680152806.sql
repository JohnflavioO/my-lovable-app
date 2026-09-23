
-- technical_clients
DROP POLICY IF EXISTS "Support can view clients" ON public.technical_clients;
DROP POLICY IF EXISTS "Support can insert clients" ON public.technical_clients;
DROP POLICY IF EXISTS "Support can update clients" ON public.technical_clients;
DROP POLICY IF EXISTS "Support managers delete clients" ON public.technical_clients;

CREATE POLICY "Support can view clients" ON public.technical_clients FOR SELECT
USING (is_admin() OR (is_support_any() AND current_user_company_id() IS NOT NULL AND company_id = current_user_company_id()));
CREATE POLICY "Support can insert clients" ON public.technical_clients FOR INSERT
WITH CHECK (is_admin() OR (is_support_any() AND current_user_company_id() IS NOT NULL AND company_id = current_user_company_id()));
CREATE POLICY "Support can update clients" ON public.technical_clients FOR UPDATE
USING (is_admin() OR (is_support_any() AND current_user_company_id() IS NOT NULL AND company_id = current_user_company_id()))
WITH CHECK (is_admin() OR (is_support_any() AND current_user_company_id() IS NOT NULL AND company_id = current_user_company_id()));
CREATE POLICY "Support managers delete clients" ON public.technical_clients FOR DELETE
USING (is_admin() OR (is_support_manager() AND current_user_company_id() IS NOT NULL AND company_id = current_user_company_id()));

-- technical_orders
DROP POLICY IF EXISTS "Support can view orders" ON public.technical_orders;
DROP POLICY IF EXISTS "Support can insert orders" ON public.technical_orders;
DROP POLICY IF EXISTS "Support can update orders" ON public.technical_orders;
DROP POLICY IF EXISTS "Support managers delete orders" ON public.technical_orders;

CREATE POLICY "Support can view orders" ON public.technical_orders FOR SELECT
USING (is_admin() OR (is_support_any() AND current_user_company_id() IS NOT NULL AND company_id = current_user_company_id()));
CREATE POLICY "Support can insert orders" ON public.technical_orders FOR INSERT
WITH CHECK (is_admin() OR (is_support_any() AND current_user_company_id() IS NOT NULL AND company_id = current_user_company_id()));
CREATE POLICY "Support can update orders" ON public.technical_orders FOR UPDATE
USING (is_admin() OR (is_support_any() AND current_user_company_id() IS NOT NULL AND company_id = current_user_company_id()))
WITH CHECK (is_admin() OR (is_support_any() AND current_user_company_id() IS NOT NULL AND company_id = current_user_company_id()));
CREATE POLICY "Support managers delete orders" ON public.technical_orders FOR DELETE
USING (is_admin() OR (is_support_manager() AND current_user_company_id() IS NOT NULL AND company_id = current_user_company_id()));

-- technical_products
DROP POLICY IF EXISTS "Support can view products" ON public.technical_products;
DROP POLICY IF EXISTS "Support can insert products" ON public.technical_products;
DROP POLICY IF EXISTS "Support can update products" ON public.technical_products;
DROP POLICY IF EXISTS "Support can delete products" ON public.technical_products;

CREATE POLICY "Support can view products" ON public.technical_products FOR SELECT
USING (is_admin() OR (is_support_any() AND current_user_company_id() IS NOT NULL AND company_id = current_user_company_id()));
CREATE POLICY "Support can insert products" ON public.technical_products FOR INSERT
WITH CHECK (is_admin() OR (is_support_any() AND current_user_company_id() IS NOT NULL AND company_id = current_user_company_id()));
CREATE POLICY "Support can update products" ON public.technical_products FOR UPDATE
USING (is_admin() OR (is_support_any() AND current_user_company_id() IS NOT NULL AND company_id = current_user_company_id()))
WITH CHECK (is_admin() OR (is_support_any() AND current_user_company_id() IS NOT NULL AND company_id = current_user_company_id()));
CREATE POLICY "Support can delete products" ON public.technical_products FOR DELETE
USING (is_admin() OR (is_support_any() AND current_user_company_id() IS NOT NULL AND company_id = current_user_company_id()));

-- generated_contracts: remove NULL company bypass on insert
DROP POLICY IF EXISTS generated_contracts_insert_policy ON public.generated_contracts;
CREATE POLICY generated_contracts_insert_policy ON public.generated_contracts FOR INSERT
WITH CHECK (
  created_by = auth.uid()
  AND (
    is_admin()
    OR (company_id IS NOT NULL AND company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.company_id IS NOT NULL))
  )
);
