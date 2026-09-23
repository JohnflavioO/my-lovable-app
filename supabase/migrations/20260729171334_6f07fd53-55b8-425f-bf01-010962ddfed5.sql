CREATE OR REPLACE FUNCTION public.transfer_reseller_registration_portfolio(p_registration_id uuid, p_new_assigned_user_id uuid, p_reason text DEFAULT NULL::text, p_transfer_client boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg RECORD; v_name text; v_target RECORD; v_client RECORD;
  v_client_transferred boolean := false;
  v_prev_client_owner uuid;
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
    SELECT id, source, created_by, assigned_user_id INTO v_client
      FROM public.clients WHERE id = v_reg.client_id;
    IF v_client.id IS NOT NULL AND COALESCE(v_client.source,'') IN ('landing_revenda_mci','landing_revenda') THEN
      v_prev_client_owner := COALESCE(v_client.created_by, v_client.assigned_user_id);
      UPDATE public.clients
         SET created_by = p_new_assigned_user_id,      -- campo oficial da carteira (RLS / Meus clientes)
             salesperson_id = p_new_assigned_user_id,
             assigned_user_id = p_new_assigned_user_id,
             assigned_at = now(),
             updated_at = now()
       WHERE id = v_reg.client_id;
      v_client_transferred := true;
    ELSE
      RAISE EXCEPTION 'A carteira deste cliente não pode ser transferida automaticamente: cliente não foi criado pela landing';
    END IF;
  END IF;

  INSERT INTO public.reseller_registration_history
    (registration_id, action, performed_by, performed_by_name, previous_assigned_user_id, new_assigned_user_id, notes, metadata)
  VALUES (p_registration_id, 'portfolio_transferred', auth.uid(), v_name, v_reg.assigned_user_id, p_new_assigned_user_id,
          NULLIF(btrim(p_reason),''),
          jsonb_build_object('client_transferred', v_client_transferred,
                             'client_id', v_reg.client_id,
                             'previous_client_owner', v_prev_client_owner,
                             'new_client_owner', CASE WHEN v_client_transferred THEN p_new_assigned_user_id END));

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