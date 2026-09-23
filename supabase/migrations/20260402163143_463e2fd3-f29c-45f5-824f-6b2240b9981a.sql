DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

CREATE POLICY "Admins can manage roles"
ON public.user_roles
AS PERMISSIVE
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());