
-- Fix user_approvals: add explicit WITH CHECK
DROP POLICY IF EXISTS "Gestors can update approvals" ON public.user_approvals;
CREATE POLICY "Gestors can update approvals"
ON public.user_approvals
FOR UPDATE
USING (is_gestor() AND (user_id <> auth.uid()))
WITH CHECK (is_gestor() AND (user_id <> auth.uid()));

-- Fix clients: ensure trigger enforcement for support field-level restriction is active
-- (trigger prevent_support_client_field_escalation already exists; recreate to guarantee)
DROP TRIGGER IF EXISTS trg_prevent_support_client_field_escalation ON public.clients;
CREATE TRIGGER trg_prevent_support_client_field_escalation
BEFORE UPDATE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.prevent_support_client_field_escalation();
