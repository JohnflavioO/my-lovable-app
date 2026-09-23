
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS needs_manual_link boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sync_candidates jsonb;

CREATE INDEX IF NOT EXISTS idx_products_needs_manual_link ON public.products(needs_manual_link) WHERE needs_manual_link = true;
CREATE INDEX IF NOT EXISTS idx_products_loja_integrada_id ON public.products(loja_integrada_id) WHERE loja_integrada_id IS NOT NULL;
