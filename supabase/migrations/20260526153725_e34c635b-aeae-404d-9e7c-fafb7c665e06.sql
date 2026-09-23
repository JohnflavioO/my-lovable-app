
-- Search path on remaining trigger helpers
ALTER FUNCTION public.handle_updated_at() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;

-- Replace permissive technical_maintenances policies with role-scoped ones
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.technical_maintenances;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.technical_maintenances;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.technical_maintenances;

CREATE POLICY "Support staff can insert maintenance"
ON public.technical_maintenances FOR INSERT TO authenticated
WITH CHECK (public.is_support_any() OR public.is_admin());

CREATE POLICY "Support staff can update maintenance"
ON public.technical_maintenances FOR UPDATE TO authenticated
USING (public.is_support_any() OR public.is_admin())
WITH CHECK (public.is_support_any() OR public.is_admin());

CREATE POLICY "Support managers can delete maintenance"
ON public.technical_maintenances FOR DELETE TO authenticated
USING (public.is_support_manager() OR public.is_admin());

-- Realtime authorization: restrict channel subscriptions by topic to the user
-- Projetos novos já vêm com RLS ligado e a tabela pertence a supabase_realtime_admin,
-- então o ALTER só roda quando realmente precisa (senão falha com "must be owner").
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'realtime.messages'::regclass) THEN
    ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DROP POLICY IF EXISTS "Users can subscribe to own realtime topics" ON realtime.messages;
CREATE POLICY "Users can subscribe to own realtime topics"
ON realtime.messages FOR SELECT TO authenticated
USING (
  (realtime.topic() LIKE 'notifications:' || auth.uid()::text || '%')
  OR (realtime.topic() LIKE 'quote_messages:%' AND EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id::text = split_part(realtime.topic(), ':', 2)
      AND (q.created_by = auth.uid() OR public.is_admin() OR public.is_gestor())
  ))
);

-- Revoke anonymous execute on internal SECURITY DEFINER RPCs/admin helpers
REVOKE EXECUTE ON FUNCTION public.delete_quote_cascade(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_smart_opportunities_diagnostics() FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_all_approved_quotes_opportunities() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_team_dashboard_sellers() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_team_dashboard_recent_quotes(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_team_dashboard_top_clients(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_gestor() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_financeiro() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_logistica() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_approved() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_support_any() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_support_manager() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_support_tech() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_quote_owner(uuid) FROM anon;
