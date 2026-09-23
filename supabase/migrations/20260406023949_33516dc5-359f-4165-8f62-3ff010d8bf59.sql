
DROP POLICY "System can insert notifications" ON public.notifications;

CREATE POLICY "Admins and gestors can insert notifications"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (is_admin() OR is_gestor());
