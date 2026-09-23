CREATE OR REPLACE FUNCTION public.is_support_tech()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role = 'support_tech'
    AND active = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_support_manager()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND (role = 'support_manager' OR can_access_support_manager = true)
    AND active = true
  );
END;
$$;