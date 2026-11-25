-- Infraestrutura para o banco chamar Edge Functions em horários agendados.
-- O segredo do agendamento é gerado aqui dentro e fica só no Vault: as funções
-- conferem o valor via verify_cron_secret (executável apenas pelo service_role).

-- 1) Segredos no Vault (criados só se ainda não existirem).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_secret') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cron_secret',
      'Segredo que os agendamentos do banco enviam às Edge Functions');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'project_url') THEN
    PERFORM vault.create_secret('https://eaaktxdmgewpjyimzvbc.supabase.co', 'project_url',
      'URL do projeto usada pelos agendamentos');
  END IF;
  -- Chave pública (a mesma que o site usa); só serve para passar pelo gateway.
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'anon_key') THEN
    PERFORM vault.create_secret(
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhYWt0eGRtZ2V3cGp5aW16dmJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzOTczNzcsImV4cCI6MjEwNDk3MzM3N30.a1fUt-IwHzoKfavWyXIeFMBRTM2aC-oDyGn7v5yPKa0',
      'anon_key', 'Chave pública usada pelos agendamentos para passar pelo gateway');
  END IF;
END;
$$;

-- 2) Conferência do segredo, chamada pelas Edge Functions com a chave de serviço.
CREATE OR REPLACE FUNCTION public.verify_cron_secret(p_secret text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(p_secret, '') <> ''
     AND EXISTS (
       SELECT 1 FROM vault.decrypted_secrets
        WHERE name = 'cron_secret' AND decrypted_secret = p_secret
     );
$$;
REVOKE ALL ON FUNCTION public.verify_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_secret(text) TO service_role;

-- 3) Disparo de uma Edge Function a partir do banco (usado pelos agendamentos).
CREATE OR REPLACE FUNCTION public.invoke_edge_function(p_function text, p_body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
               || '/functions/v1/' || p_function,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key'),
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body    := p_body,
    timeout_milliseconds := 60000
  );
$$;
REVOKE ALL ON FUNCTION public.invoke_edge_function(text, jsonb) FROM PUBLIC, anon, authenticated;
