
-- 1) Scope read access on low-sensitivity catalogs to approved users
DROP POLICY IF EXISTS "All authenticated users can view changelog" ON public.app_changelog;
CREATE POLICY "Approved users can view changelog"
ON public.app_changelog FOR SELECT TO authenticated
USING (public.is_approved());

DROP POLICY IF EXISTS "Authenticated users can view help videos" ON public.help_videos;
CREATE POLICY "Approved users can view help videos"
ON public.help_videos FOR SELECT TO authenticated
USING (public.is_approved());

DROP POLICY IF EXISTS "Authenticated can view brands" ON public.technical_brands;
CREATE POLICY "Approved users can view brands"
ON public.technical_brands FOR SELECT TO authenticated
USING (public.is_approved());

-- 2) Dedicated permission store, admin-managed only
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  permission text NOT NULL,
  granted boolean NOT NULL DEFAULT true,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission)
);

GRANT SELECT ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own permissions" ON public.user_permissions;
CREATE POLICY "Users can view their own permissions"
ON public.user_permissions FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

-- No INSERT/UPDATE/DELETE policies: writes only via admin SECURITY DEFINER functions.

-- Backfill from profiles.permissions
INSERT INTO public.user_permissions (user_id, permission, granted)
SELECT p.user_id, kv.key, (kv.value)::boolean
FROM public.profiles p
CROSS JOIN LATERAL jsonb_each_text(COALESCE(p.permissions, '{}'::jsonb)) AS kv(key, value)
WHERE jsonb_typeof(COALESCE(p.permissions, '{}'::jsonb) -> kv.key) = 'boolean'
ON CONFLICT (user_id, permission) DO UPDATE SET granted = EXCLUDED.granted;

-- 3) Permission check now reads the admin-managed table only
CREATE OR REPLACE FUNCTION public.current_user_has_permission(_permission text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (
      SELECT up.granted
      FROM public.user_permissions up
      WHERE up.user_id = auth.uid() AND up.permission = _permission
      LIMIT 1
    ),
    false
  )
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_user_permissions(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF NOT (is_admin() OR is_gestor()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  SELECT COALESCE(jsonb_object_agg(up.permission, up.granted), '{}'::jsonb)
  INTO result
  FROM public.user_permissions up
  WHERE up.user_id = _user_id;
  RETURN COALESCE(result, '{}'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_user_permissions(_user_id uuid, _permissions jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  DELETE FROM public.user_permissions WHERE user_id = _user_id;

  INSERT INTO public.user_permissions (user_id, permission, granted, granted_by)
  SELECT _user_id, kv.key, (kv.value)::boolean, auth.uid()
  FROM jsonb_each_text(COALESCE(_permissions, '{}'::jsonb)) AS kv(key, value)
  WHERE jsonb_typeof(COALESCE(_permissions, '{}'::jsonb) -> kv.key) = 'boolean';

  -- keep legacy profile column in sync for read-only compatibility
  UPDATE public.profiles SET permissions = COALESCE(_permissions, '{}'::jsonb) WHERE user_id = _user_id;
END;
$function$;

-- 4) Session access payload reads the authoritative table
CREATE OR REPLACE FUNCTION public.get_current_user_access()
RETURNS TABLE(full_name text, phone text, role text, avatar_url text, force_password_change boolean, company_id uuid, can_access_support_manager boolean, approval_status text, roles text[], permissions jsonb)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    COALESCE(
      (
        SELECT jsonb_object_agg(up.permission, up.granted)
        FROM public.user_permissions up
        WHERE up.user_id = auth.uid()
      ),
      '{}'::jsonb
    ) AS permissions
  FROM public.profiles p
  LEFT JOIN public.user_approvals ua ON ua.user_id = p.user_id
  WHERE p.user_id = auth.uid()
  LIMIT 1
$function$;
