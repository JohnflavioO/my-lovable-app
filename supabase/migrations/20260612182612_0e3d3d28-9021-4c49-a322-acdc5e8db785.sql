
-- 1) Backfill user_roles from profiles for support roles
INSERT INTO public.user_roles (user_id, role)
SELECT p.user_id, 'support_manager'
FROM public.profiles p
WHERE (p.role = 'support_manager' OR p.can_access_support_manager = true)
  AND p.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id AND ur.role = 'support_manager');

INSERT INTO public.user_roles (user_id, role)
SELECT p.user_id, 'support_tech'
FROM public.profiles p
WHERE p.role = 'support_tech'
  AND p.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id AND ur.role = 'support_tech');

-- 2) Rewrite support helper functions to use user_roles
CREATE OR REPLACE FUNCTION public.is_support_manager()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'support_manager'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_support_tech()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'support_tech'
  );
$$;

-- 3) Prevent privilege escalation via profile updates
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    NEW.role := OLD.role;
    NEW.permissions := OLD.permissions;
    NEW.active := OLD.active;
    NEW.company_id := OLD.company_id;
    NEW.can_access_support_manager := OLD.can_access_support_manager;
    NEW.force_password_change := OLD.force_password_change;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 4) Replace profiles.role-based policies with helper-function-based policies
-- contract_templates
DROP POLICY IF EXISTS "Admins and Managers can manage templates" ON public.contract_templates;
CREATE POLICY "Admins and Managers can manage templates"
ON public.contract_templates
FOR ALL TO authenticated
USING (public.is_admin() OR public.is_gestor())
WITH CHECK (public.is_admin() OR public.is_gestor());

-- technical_cloud_files / suppliers / budgets / services / purchase_orders / purchase_order_items
DROP POLICY IF EXISTS "Support Access" ON public.technical_cloud_files;
CREATE POLICY "Support Access" ON public.technical_cloud_files
FOR ALL TO authenticated
USING (public.is_admin() OR public.is_gestor() OR public.is_support_any())
WITH CHECK (public.is_admin() OR public.is_gestor() OR public.is_support_any());

DROP POLICY IF EXISTS "Support Access" ON public.technical_suppliers;
CREATE POLICY "Support Access" ON public.technical_suppliers
FOR ALL TO authenticated
USING (public.is_admin() OR public.is_gestor() OR public.is_support_any())
WITH CHECK (public.is_admin() OR public.is_gestor() OR public.is_support_any());

DROP POLICY IF EXISTS "Support Access" ON public.technical_budgets;
CREATE POLICY "Support Access" ON public.technical_budgets
FOR ALL TO authenticated
USING (public.is_admin() OR public.is_gestor() OR public.is_support_any())
WITH CHECK (public.is_admin() OR public.is_gestor() OR public.is_support_any());

DROP POLICY IF EXISTS "Support Access" ON public.technical_services;
CREATE POLICY "Support Access" ON public.technical_services
FOR ALL TO authenticated
USING (public.is_admin() OR public.is_gestor() OR public.is_support_any())
WITH CHECK (public.is_admin() OR public.is_gestor() OR public.is_support_any());

DROP POLICY IF EXISTS "Support Access" ON public.technical_purchase_orders;
CREATE POLICY "Support Access" ON public.technical_purchase_orders
FOR ALL TO authenticated
USING (public.is_admin() OR public.is_gestor() OR public.is_support_any())
WITH CHECK (public.is_admin() OR public.is_gestor() OR public.is_support_any());

DROP POLICY IF EXISTS "Support Access" ON public.technical_purchase_order_items;
CREATE POLICY "Support Access" ON public.technical_purchase_order_items
FOR ALL TO authenticated
USING (public.is_admin() OR public.is_gestor() OR public.is_support_any())
WITH CHECK (public.is_admin() OR public.is_gestor() OR public.is_support_any());

-- product_relationships: remove profiles.role check, restrict public read to authenticated
DROP POLICY IF EXISTS "Admins can manage product relationships" ON public.product_relationships;
CREATE POLICY "Admins can manage product relationships"
ON public.product_relationships
FOR ALL TO authenticated
USING (public.is_admin() OR public.is_gestor())
WITH CHECK (public.is_admin() OR public.is_gestor());

DROP POLICY IF EXISTS "Product relationships are viewable by everyone" ON public.product_relationships;
CREATE POLICY "Authenticated can view product relationships"
ON public.product_relationships
FOR SELECT TO authenticated
USING (true);

-- technical_brands: restrict public read to authenticated
DROP POLICY IF EXISTS "Everyone can view brands" ON public.technical_brands;
CREATE POLICY "Authenticated can view brands"
ON public.technical_brands
FOR SELECT TO authenticated
USING (true);

-- 5) Admin SELECT for financial tables
CREATE POLICY "Admins can view financial records"
ON public.financial_records
FOR SELECT TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins can view financial action history"
ON public.financial_action_history
FOR SELECT TO authenticated
USING (public.is_admin());
