-- =============================================================================
-- Agendamentos (pg_cron) das edge functions que rodam sozinhas.
--
-- O projeto original criou esses jobs fora das migrations, então os horários
-- abaixo são uma sugestão. Se tiver acesso ao banco antigo, confira os reais com:
--   select jobname, schedule, command from cron.job;
--
-- ANTES DE RODAR: troque os dois valores marcados com <<< >>>.
--   - project_url: Settings > API > Project URL
--   - service_role_key: Settings > API Keys > aba "Legacy" > service_role
--     (precisa ser a chave JWT legada: a função loja-integrada compara o header
--      com SUPABASE_SERVICE_ROLE_KEY, que é essa chave)
-- Pode rodar mais de uma vez: os segredos são atualizados e os jobs, substituídos.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
DECLARE
  v_url text := '<<< https://SEU-PROJETO.supabase.co >>>';
  v_key text := '<<< SERVICE_ROLE_KEY >>>';
BEGIN
  IF v_url LIKE '<<<%' OR v_key LIKE '<<<%' THEN
    RAISE EXCEPTION 'Preencha project_url e service_role_key no topo do script antes de rodar.';
  END IF;

  IF EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'project_url') THEN
    PERFORM vault.update_secret((SELECT id FROM vault.secrets WHERE name = 'project_url'), v_url);
  ELSE
    PERFORM vault.create_secret(v_url, 'project_url');
  END IF;

  IF EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'service_role_key') THEN
    PERFORM vault.update_secret((SELECT id FROM vault.secrets WHERE name = 'service_role_key'), v_key);
  ELSE
    PERFORM vault.create_secret(v_key, 'service_role_key');
  END IF;
END $$;

-- Chama uma edge function com a service role; usado pelos jobs abaixo.
CREATE OR REPLACE FUNCTION public.invoke_edge_function(p_function text, p_body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/' || p_function,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body    := p_body,
    timeout_milliseconds := 60000
  );
$$;
REVOKE ALL ON FUNCTION public.invoke_edge_function(text, jsonb) FROM PUBLIC, anon, authenticated;

-- Lembretes de demonstração: 1x por dia, 08:00 de Brasília (11:00 UTC)
SELECT cron.schedule('demonstration-reminders', '0 11 * * *',
  $$ SELECT public.invoke_edge_function('demonstration-reminders') $$);

-- Follow-ups vencidos -> notificação interna + push: a cada 15 minutos
SELECT cron.schedule('scan-followups', '*/15 * * * *',
  $$ SELECT public.invoke_edge_function('send-push-notifications', '{"action":"scan_followups"}') $$);

-- Importação incremental de pedidos da Loja Integrada: a cada 30 minutos
-- (sem credenciais cadastradas em Integrações, a função só retorna "skipping")
SELECT cron.schedule('loja-integrada-auto-sync', '*/30 * * * *',
  $$ SELECT public.invoke_edge_function('loja-integrada', '{"action":"auto_sync"}') $$);
