-- =============================================================================
-- Complementos: rodar DEPOIS de aplicar todas as migrations de supabase/migrations.
--
-- O app usa buckets que o projeto original criou fora das migrations. As
-- policies deles já vêm das migrations; aqui só criamos os buckets.
-- Pode rodar mais de uma vez.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public) VALUES
  -- Contratos gerados e assinados enviados pelo usuário (ContractGenerator)
  ('contracts',         'contracts',         false),
  -- Nuvem de arquivos do suporte técnico (SupportCloud)
  ('technical-cloud',   'technical-cloud',   false),
  -- Comprovantes de orçamento técnico (SupportBudgets)
  ('budget-proofs',     'budget-proofs',     false),
  -- Miniaturas da central de ajuda; o app usa getPublicUrl, então precisa ser público
  ('help-thumbnails',   'help-thumbnails',   true),
  -- PDFs assinados e evidências da assinatura eletrônica (edge function, service role)
  ('contract-signed',   'contract-signed',   false),
  ('contract-evidence', 'contract-evidence', false)
ON CONFLICT (id) DO NOTHING;

-- Os três abaixo já são criados pelas migrations; repetidos só para o script
-- funcionar sozinho caso alguma migration de storage tenha sido pulada.
INSERT INTO storage.buckets (id, name, public) VALUES
  ('avatars',    'avatars',    true),
  ('quote-pdfs', 'quote-pdfs', false),
  ('nf-pdfs',    'nf-pdfs',    false)
ON CONFLICT (id) DO NOTHING;
