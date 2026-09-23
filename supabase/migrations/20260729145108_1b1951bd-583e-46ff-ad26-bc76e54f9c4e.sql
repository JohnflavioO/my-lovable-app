
-- 1) Normaliza status legados
UPDATE public.reseller_registrations SET registration_status = CASE registration_status
  WHEN 'em_contato' THEN 'contatado'
  WHEN 'aprovado' THEN 'aprovado_revenda'
  WHEN 'recusado' THEN 'reprovado'
  WHEN 'arquivado' THEN 'reprovado'
  ELSE registration_status END
WHERE registration_status IN ('em_contato','aprovado','recusado','arquivado');

-- 2) RPC de status com enum fixo + justificativa obrigatória para reprovado
CREATE OR REPLACE FUNCTION public.set_reseller_registration_status(p_registration_id uuid, p_status text, p_notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_reg RECORD; v_name text;
BEGIN
  IF p_status NOT IN ('novo','pendente_distribuicao','em_analise','contatado','aprovado_revenda','reprovado') THEN
    RAISE EXCEPTION 'Status inválido: %', p_status;
  END IF;

  IF p_status = 'reprovado' AND COALESCE(btrim(p_notes), '') = '' THEN
    RAISE EXCEPTION 'Justificativa obrigatória para reprovar o cadastro';
  END IF;

  SELECT * INTO v_reg FROM public.reseller_registrations WHERE id = p_registration_id;
  IF v_reg IS NULL THEN RAISE EXCEPTION 'Cadastro não encontrado'; END IF;

  IF NOT (v_reg.assigned_user_id = auth.uid() OR public.is_admin() OR public.is_gestor()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT full_name INTO v_name FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  UPDATE public.reseller_registrations
     SET registration_status = p_status, updated_at = now()
   WHERE id = p_registration_id;

  INSERT INTO public.reseller_registration_history
    (registration_id, action, performed_by, performed_by_name, previous_status, new_status, notes)
  VALUES (p_registration_id, 'status_changed', auth.uid(), v_name, v_reg.registration_status, p_status, p_notes);

  RETURN jsonb_build_object('ok', true, 'registration_id', p_registration_id, 'status', p_status);
END $function$;

-- 3) Consultores aptos a receber cadastros
CREATE OR REPLACE FUNCTION public.list_reseller_assignable_users()
RETURNS TABLE(user_id uuid, full_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.user_id, COALESCE(NULLIF(p.full_name,''), 'Sem nome') AS full_name
  FROM public.profiles p
  WHERE p.active = true
    AND (public.is_admin() OR public.is_gestor())
    AND (p.company_id IS NOT DISTINCT FROM public.current_user_company_id() OR public.current_user_company_id() IS NULL)
    AND COALESCE(p.role,'') NOT IN ('financeiro','logistica')
  ORDER BY 2
$function$;

-- 4) Transferência segura de responsável
CREATE OR REPLACE FUNCTION public.transfer_reseller_registration_portfolio(
  p_registration_id uuid,
  p_new_assigned_user_id uuid,
  p_reason text DEFAULT NULL,
  p_transfer_client boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reg RECORD; v_name text; v_target RECORD; v_client RECORD;
  v_client_transferred boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT * INTO v_reg FROM public.reseller_registrations WHERE id = p_registration_id;
  IF v_reg IS NULL THEN RAISE EXCEPTION 'Cadastro não encontrado'; END IF;

  IF NOT (public.is_admin() OR public.is_gestor()) THEN
    RAISE EXCEPTION 'Acesso negado: apenas gestores ou administradores podem transferir cadastros';
  END IF;

  SELECT p.user_id, p.full_name, p.active, p.company_id, p.role
    INTO v_target FROM public.profiles p WHERE p.user_id = p_new_assigned_user_id;
  IF v_target IS NULL THEN RAISE EXCEPTION 'Responsável informado não existe'; END IF;
  IF v_target.active IS NOT TRUE THEN RAISE EXCEPTION 'Responsável informado está inativo'; END IF;
  IF COALESCE(v_target.role,'') IN ('financeiro','logistica') THEN
    RAISE EXCEPTION 'Responsável informado não pode receber cadastros comerciais';
  END IF;
  IF public.current_user_company_id() IS NOT NULL
     AND v_target.company_id IS DISTINCT FROM public.current_user_company_id() THEN
    RAISE EXCEPTION 'Responsável informado pertence a outra empresa';
  END IF;
  IF v_reg.assigned_user_id = p_new_assigned_user_id THEN
    RAISE EXCEPTION 'O cadastro já pertence a este responsável';
  END IF;

  SELECT full_name INTO v_name FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  UPDATE public.reseller_registrations
     SET assigned_user_id = p_new_assigned_user_id,
         assigned_at = now(),
         assignment_reason = COALESCE(NULLIF(btrim(p_reason),''), assignment_reason),
         registration_status = CASE WHEN registration_status = 'pendente_distribuicao' THEN 'novo' ELSE registration_status END,
         updated_at = now()
   WHERE id = p_registration_id;

  -- Carteira do cliente: só muda quando o cliente veio da landing e foi pedido explicitamente
  IF p_transfer_client AND v_reg.client_id IS NOT NULL THEN
    SELECT id, source, assigned_user_id INTO v_client FROM public.clients WHERE id = v_reg.client_id;
    IF v_client.id IS NOT NULL AND COALESCE(v_client.source,'') = 'landing_revenda' THEN
      UPDATE public.clients
         SET assigned_user_id = p_new_assigned_user_id, assigned_at = now(), updated_at = now()
       WHERE id = v_reg.client_id;
      v_client_transferred := true;
    ELSE
      RAISE EXCEPTION 'A carteira deste cliente não pode ser transferida automaticamente: cliente não foi criado pela landing';
    END IF;
  END IF;

  INSERT INTO public.reseller_registration_history
    (registration_id, action, performed_by, performed_by_name, previous_assigned_user_id, new_assigned_user_id, notes, metadata)
  VALUES (p_registration_id, 'portfolio_transferred', auth.uid(), v_name, v_reg.assigned_user_id, p_new_assigned_user_id,
          NULLIF(btrim(p_reason),''), jsonb_build_object('client_transferred', v_client_transferred));

  IF p_new_assigned_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, related_client_id)
    VALUES (p_new_assigned_user_id,
            'Novo cadastro de revenda atribuído',
            'Você recebeu o cadastro de revenda de ' || COALESCE(v_reg.company_name, 'empresa sem nome') || '.',
            'reseller_registration',
            v_reg.client_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'registration_id', p_registration_id,
                            'assigned_user_id', p_new_assigned_user_id,
                            'client_transferred', v_client_transferred);
END $function$;

-- 5) Resumo para a listagem de Clientes (sem dados técnicos sensíveis)
CREATE OR REPLACE FUNCTION public.list_reseller_registrations_summary()
RETURNS TABLE(
  id uuid,
  client_id uuid,
  company_name text,
  trade_name text,
  cnpj text,
  registration_status text,
  is_duplicate boolean,
  duplicate_reason text,
  submitted_at timestamptz,
  assigned_user_id uuid,
  assigned_user_name text,
  consultant_selected_label text,
  viewed_by_me boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    r.id, r.client_id, r.company_name, r.trade_name, r.cnpj,
    COALESCE(r.registration_status, 'novo'),
    COALESCE(r.is_duplicate, false), r.duplicate_reason,
    COALESCE(r.submitted_at, r.created_at),
    r.assigned_user_id,
    p.full_name,
    r.consultant_selected_label,
    EXISTS (
      SELECT 1 FROM public.reseller_registration_history h
      WHERE h.registration_id = r.id AND h.action = 'viewed' AND h.performed_by = auth.uid()
    )
  FROM public.reseller_registrations r
  LEFT JOIN public.profiles p ON p.user_id = r.assigned_user_id
  WHERE auth.uid() IS NOT NULL
    AND (r.assigned_user_id = auth.uid() OR public.is_admin() OR public.is_gestor())
  ORDER BY COALESCE(r.submitted_at, r.created_at) DESC
$function$;

REVOKE ALL ON FUNCTION public.list_reseller_assignable_users() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_reseller_registrations_summary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transfer_reseller_registration_portfolio(uuid, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_reseller_assignable_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_reseller_registrations_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_reseller_registration_portfolio(uuid, uuid, text, boolean) TO authenticated;

-- 6) Realtime
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='reseller_registrations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reseller_registrations;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='reseller_registration_history') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reseller_registration_history;
  END IF;
END $$;
ALTER TABLE public.reseller_registrations REPLICA IDENTITY FULL;
ALTER TABLE public.reseller_registration_history REPLICA IDENTITY FULL;
