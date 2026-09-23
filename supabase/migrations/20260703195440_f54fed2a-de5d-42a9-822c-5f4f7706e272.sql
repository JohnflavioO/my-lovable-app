CREATE OR REPLACE FUNCTION public.current_user_company_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1),
    '00000000-0000-0000-0000-000000000001'::uuid
  )
$$;

UPDATE public.profiles
SET company_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE company_id IS NULL
  AND (
    role IN ('support_tech', 'support_manager')
    OR user_id IN (
      SELECT user_id
      FROM public.user_roles
      WHERE role IN ('support_tech', 'support_manager')
    )
  );

ALTER TABLE public.profiles
ALTER COLUMN company_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;