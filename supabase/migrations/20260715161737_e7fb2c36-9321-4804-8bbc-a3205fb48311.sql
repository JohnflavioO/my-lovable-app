-- quote_recycle_requests: exigir posse do orçamento (ou admin/gestor da mesma empresa)
DROP POLICY IF EXISTS "Users create own requests" ON public.quote_recycle_requests;

CREATE POLICY "Users create own requests"
ON public.quote_recycle_requests
FOR INSERT
TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_recycle_requests.quote_id
        AND (
          q.created_by = auth.uid()
          OR (
            public.is_gestor()
            AND q.company_id IS NOT DISTINCT FROM public.current_user_company_id()
          )
        )
    )
  )
);

-- notifications: escopo por empresa para gestores; admin permanece global
DROP POLICY IF EXISTS "Admins and gestors can insert notifications" ON public.notifications;

CREATE POLICY "Admins and gestors can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR (
    public.is_gestor()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = notifications.user_id
        AND p.company_id IS NOT DISTINCT FROM public.current_user_company_id()
    )
  )
);