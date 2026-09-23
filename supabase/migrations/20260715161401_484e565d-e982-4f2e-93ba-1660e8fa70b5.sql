DROP FUNCTION IF EXISTS public.get_current_user_access();

CREATE OR REPLACE FUNCTION public.get_current_user_access()
RETURNS TABLE (
  full_name text,
  phone text,
  role text,
  avatar_url text,
  force_password_change boolean,
  company_id uuid,
  can_access_support_manager boolean,
  approval_status text,
  roles text[],
  permissions jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.full_name,
    p.phone,
    p.role,
    p.avatar_url,
    COALESCE(p.force_password_change, false) AS force_password_change,
    p.company_id,
    COALESCE(p.can_access_support_manager, false) AS can_access_support_manager,
    ua.status AS approval_status,
    COALESCE(
      ARRAY(
        SELECT DISTINCT ur.role::text
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
      ),
      ARRAY[]::text[]
    ) AS roles,
    COALESCE(p.permissions, '{}'::jsonb) AS permissions
  FROM public.profiles p
  LEFT JOIN public.user_approvals ua ON ua.user_id = p.user_id
  WHERE p.user_id = auth.uid()
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_current_user_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_access() TO authenticated;