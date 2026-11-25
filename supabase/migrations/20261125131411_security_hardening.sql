-- Endurecimento de segurança sem alterar o fluxo da equipe.
-- Cada item foi testado em transação descartada antes de ser aplicado.

-- 1) delete_quote_cascade: rodava como SECURITY DEFINER sem checar quem chama,
--    permitindo que qualquer pessoa (inclusive sem login) apagasse orçamentos.
--    Agora: anônimo é bloqueado; usuário logado só exclui se for admin, criador,
--    vendedor responsável ou gestor da mesma empresa. Chamadas de serviço
--    (auth.uid() nulo e papel diferente de anon) continuam permitidas.
CREATE OR REPLACE FUNCTION public.delete_quote_cascade(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote record;
BEGIN
  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT id, created_by, salesperson_id, company_id
    INTO v_quote
    FROM public.quotes
   WHERE id = p_quote_id;

  IF NOT FOUND THEN
    RETURN; -- já excluído: mantém o comportamento anterior (sem erro)
  END IF;

  IF auth.uid() IS NOT NULL AND NOT (
       public.is_admin()
    OR (public.is_approved() AND (
             v_quote.created_by = auth.uid()
          OR v_quote.salesperson_id = auth.uid()
          OR (public.is_gestor()
              AND v_quote.company_id IS NOT NULL
              AND v_quote.company_id = public.current_user_company_id())
       ))
  ) THEN
    RAISE EXCEPTION 'Você não tem permissão para excluir este orçamento' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.quote_items WHERE quote_id = p_quote_id;
  DELETE FROM public.quotes WHERE id = p_quote_id;
END;
$$;

-- 2) Funções internas que não precisam ser chamadas sem login.
--    Mantidas para anon: helpers usados nas policies (is_admin, is_gestor,
--    current_user_company_id, get_public_quote_token...), páginas públicas
--    (public_quote_action, get_public_*_tracking) e get_current_user_access.
--    Usuários logados e service_role mantêm o acesso explicitamente.
DO $$
DECLARE
  f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN (
         'delete_quote_cascade',
         'admin_get_user_permissions',
         'admin_set_user_permissions',
         'diagnose_product_search',
         'generate_quote_number',
         'generate_technical_os_number',
         'get_default_origin_cep',
         'set_default_origin_cep',
         'get_team_dashboard_recent_quotes',
         'get_team_dashboard_sellers',
         'get_team_dashboard_top_clients',
         'log_quote_payment_block',
         'process_smart_opportunities_diagnostics',
         'search_product_candidates'
       )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END;
$$;

-- 3) Funções de trigger: o Postgres não exige EXECUTE para disparar trigger
--    (testado), então retirar o EXECUTE direto de anon não muda nada no fluxo.
DO $$
DECLARE
  f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.prosecdef
       AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END;
$$;

-- 4) Gestor só altera/vê aprovações de usuários da própria empresa
--    (ou de cadastros novos ainda sem empresa, para não travar a aprovação).
DROP POLICY IF EXISTS "Gestors can update approvals" ON public.user_approvals;
CREATE POLICY "Gestors can update approvals" ON public.user_approvals
  FOR UPDATE
  USING (
    public.is_gestor() AND user_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.user_id = user_approvals.user_id
         AND (p.company_id IS NULL OR p.company_id = public.current_user_company_id())
    )
  )
  WITH CHECK (
    public.is_gestor() AND user_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.user_id = user_approvals.user_id
         AND (p.company_id IS NULL OR p.company_id = public.current_user_company_id())
    )
  );

DROP POLICY IF EXISTS "Gestors can view all approvals" ON public.user_approvals;
CREATE POLICY "Gestors can view all approvals" ON public.user_approvals
  FOR SELECT
  USING (
    public.is_gestor()
    AND (
      NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = user_approvals.user_id)
      OR EXISTS (
        SELECT 1 FROM public.profiles p
         WHERE p.user_id = user_approvals.user_id
           AND (p.company_id IS NULL OR p.company_id = public.current_user_company_id())
      )
    )
  );

-- 5) search_path fixo (mesmo valor efetivo de hoje).
ALTER FUNCTION public.generate_os_number() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION backup_restore.vincular_contas() SET search_path = public;
