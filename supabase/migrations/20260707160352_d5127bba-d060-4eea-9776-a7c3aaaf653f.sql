
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS bloquear_atualizacao_logistica boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS logistica_atualizada_em timestamptz,
  ADD COLUMN IF NOT EXISTS loja_integrada_id text,
  ADD COLUMN IF NOT EXISTS loja_integrada_sync_source text;

CREATE INDEX IF NOT EXISTS idx_products_loja_integrada_id ON public.products (loja_integrada_id) WHERE loja_integrada_id IS NOT NULL;
