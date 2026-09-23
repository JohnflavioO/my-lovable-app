-- Allow admins to delete profiles (for permanent user removal from trash)
CREATE POLICY "Admins can delete profiles"
ON public.profiles
FOR DELETE
TO authenticated
USING (is_admin());

-- Allow admins to delete user_approvals (for permanent user removal from trash)
CREATE POLICY "Admins can delete approvals"
ON public.user_approvals
FOR DELETE
TO authenticated
USING (is_admin());