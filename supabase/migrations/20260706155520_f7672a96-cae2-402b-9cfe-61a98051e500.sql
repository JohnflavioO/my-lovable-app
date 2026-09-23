-- Fix recursive RLS policies that block auth bootstrap

CREATE OR REPLACE FUNCTION public.can_view_company_profile(_target_user_id uuid, _target_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_gestor()
    OR public.is_financeiro()
    OR public.is_logistica()
    OR (
      _target_company_id IS NOT NULL
      AND _target_company_id = public.current_user_company_id()
      AND (public.is_gestor() OR public.is_financeiro() OR public.is_logistica())
    )
$$;

CREATE OR REPLACE FUNCTION public.can_view_company_role(_target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = _target_user_id
      AND p.company_id = public.current_user_company_id()
  )
  AND public.is_gestor()
$$;

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Gestors can view company profiles" ON public.profiles;
DROP POLICY IF EXISTS "Financeiro can view company profiles" ON public.profiles;
DROP POLICY IF EXISTS "Logistica can view company profiles" ON public.profiles;

CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins can update all profiles"
ON public.profiles FOR UPDATE TO authenticated
USING (public.is_admin());

CREATE POLICY "Gestors can view company profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  public.is_gestor()
  AND company_id = public.current_user_company_id()
);

CREATE POLICY "Financeiro can view company profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  public.is_financeiro()
  AND company_id = public.current_user_company_id()
);

CREATE POLICY "Logistica can view company profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  public.is_logistica()
  AND company_id = public.current_user_company_id()
);

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Gestors can view company roles" ON public.user_roles;

CREATE POLICY "Admins can manage roles"
ON public.user_roles
AS PERMISSIVE
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Gestors can view company roles"
ON public.user_roles FOR SELECT TO authenticated
USING (public.can_view_company_role(user_id));