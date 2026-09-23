
-- Scope profiles SELECT for gestor/financeiro/logistica by company
DROP POLICY IF EXISTS "Gestors can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Financeiro can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Logistica can view all profiles" ON public.profiles;

CREATE POLICY "Gestors can view company profiles"
ON public.profiles FOR SELECT TO authenticated
USING (is_gestor() AND company_id = current_user_company_id());

CREATE POLICY "Financeiro can view company profiles"
ON public.profiles FOR SELECT TO authenticated
USING (is_financeiro() AND company_id = current_user_company_id());

CREATE POLICY "Logistica can view company profiles"
ON public.profiles FOR SELECT TO authenticated
USING (is_logistica() AND company_id = current_user_company_id());

-- Scope user_roles SELECT for gestor by company (via profiles.company_id)
DROP POLICY IF EXISTS "Gestors can view all roles" ON public.user_roles;

CREATE POLICY "Gestors can view company roles"
ON public.user_roles FOR SELECT TO authenticated
USING (
  is_gestor()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = user_roles.user_id
      AND p.company_id = current_user_company_id()
  )
);

-- Scope assistant_audit_log SELECT for admin/gestor by company
DROP POLICY IF EXISTS "Users read own audit" ON public.assistant_audit_log;

CREATE POLICY "Users read own audit"
ON public.assistant_audit_log FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR ((is_admin() OR is_gestor()) AND company_id = current_user_company_id())
);
