-- =========================================================
-- CORREÇÕES — Integração "Cadastro de Revendas MCI" (Fase 1)
-- =========================================================

-- 1. IDEMPOTÊNCIA: external_registration_id
DO $$
DECLARE v_bad int;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients'
      AND column_name='external_registration_id' AND data_type <> 'uuid'
  ) THEN
    SELECT count(*) INTO v_bad
      FROM public.clients
     WHERE external_registration_id IS NOT NULL
       AND external_registration_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    IF v_bad = 0 THEN
      ALTER TABLE public.clients
        ALTER COLUMN external_registration_id TYPE uuid
        USING NULLIF(external_registration_id, '')::uuid;
    ELSE
      RAISE NOTICE 'Conversão ignorada: % valores não convertíveis', v_bad;
    END IF;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS clients_external_registration_id_uidx
  ON public.clients (external_registration_id) WHERE external_registration_id IS NOT NULL;

-- 2. Novos campos do contrato no cadastro
ALTER TABLE public.reseller_registrations
  ADD COLUMN IF NOT EXISTS external_registration_id uuid,
  ADD COLUMN IF NOT EXISTS commercial_contact_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS referrer text,
  ADD COLUMN IF NOT EXISTS form_started_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS reseller_registrations_external_id_uidx
  ON public.reseller_registrations (external_registration_id)
  WHERE external_registration_id IS NOT NULL;

-- 3. RATE LIMIT PERSISTENTE
CREATE TABLE IF NOT EXISTS public.reseller_rate_limit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  hit_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reseller_rate_limit_ip_time
  ON public.reseller_rate_limit (ip_hash, hit_at DESC);
ALTER TABLE public.reseller_rate_limit ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.reseller_rate_limit TO service_role;

CREATE OR REPLACE FUNCTION public.reseller_rate_limit_hit(p_ip_hash text, p_max int DEFAULT 5, p_window_seconds int DEFAULT 60)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_hits int;
BEGIN
  DELETE FROM public.reseller_rate_limit WHERE hit_at < now() - interval '1 hour';
  INSERT INTO public.reseller_rate_limit (ip_hash) VALUES (p_ip_hash);
  SELECT count(*) INTO v_hits
    FROM public.reseller_rate_limit
   WHERE ip_hash = p_ip_hash
     AND hit_at > now() - make_interval(secs => p_window_seconds);
  RETURN v_hits > p_max; -- true = bloqueado
END $$;
REVOKE ALL ON FUNCTION public.reseller_rate_limit_hit(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reseller_rate_limit_hit(text, int, int) TO service_role;

-- 4. GRANTS COM PRIVILÉGIO MÍNIMO
-- authenticated: apenas leitura, sempre filtrada pela RLS existente
GRANT SELECT ON public.reseller_consultants TO authenticated;
GRANT SELECT ON public.reseller_registrations TO authenticated;
GRANT SELECT ON public.reseller_registration_history TO authenticated;
GRANT SELECT ON public.reseller_consultant_history TO authenticated;

-- anon: nenhum acesso direto (a listagem pública usa Edge Function)
REVOKE ALL ON public.reseller_consultants FROM anon;
REVOKE ALL ON public.reseller_registrations FROM anon;
REVOKE ALL ON public.reseller_registration_history FROM anon;
REVOKE ALL ON public.reseller_consultant_history FROM anon;
REVOKE ALL ON public.reseller_rate_limit FROM anon, authenticated;

-- service_role: privilégios explícitos para as Edge Functions
GRANT ALL ON public.reseller_consultants TO service_role;
GRANT ALL ON public.reseller_registrations TO service_role;
GRANT ALL ON public.reseller_registration_history TO service_role;
GRANT ALL ON public.reseller_consultant_history TO service_role;

-- 5. RPC SEGURA: alterar status do cadastro (grava histórico)
CREATE OR REPLACE FUNCTION public.set_reseller_registration_status(
  p_registration_id uuid, p_status text, p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_reg RECORD; v_name text;
BEGIN
  IF p_status NOT IN ('novo','pendente_distribuicao','em_analise','em_contato','aprovado','recusado','arquivado') THEN
    RAISE EXCEPTION 'Status inválido: %', p_status;
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
END $$;
REVOKE ALL ON FUNCTION public.set_reseller_registration_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_reseller_registration_status(uuid, text, text) TO authenticated, service_role;

-- 6. RPC SEGURA: registrar visualização
CREATE OR REPLACE FUNCTION public.log_reseller_registration_view(p_registration_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_reg RECORD; v_name text;
BEGIN
  SELECT * INTO v_reg FROM public.reseller_registrations WHERE id = p_registration_id;
  IF v_reg IS NULL THEN RETURN; END IF;
  IF NOT (v_reg.assigned_user_id = auth.uid() OR public.is_admin() OR public.is_gestor()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  SELECT full_name INTO v_name FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF NOT EXISTS (
    SELECT 1 FROM public.reseller_registration_history
     WHERE registration_id = p_registration_id AND action = 'viewed' AND performed_by = auth.uid()
  ) THEN
    INSERT INTO public.reseller_registration_history (registration_id, action, performed_by, performed_by_name)
    VALUES (p_registration_id, 'viewed', auth.uid(), v_name);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.log_reseller_registration_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_reseller_registration_view(uuid) TO authenticated, service_role;