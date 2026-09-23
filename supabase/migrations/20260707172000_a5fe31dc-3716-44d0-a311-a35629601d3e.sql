
-- =========================================================
-- product_external_links: mapeamento CRM <-> integrações
-- =========================================================
CREATE TABLE IF NOT EXISTS public.product_external_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_product_id text NOT NULL,
  external_sku text,
  external_code text,
  external_name text,
  sync_status text NOT NULL DEFAULT 'pending', -- linked | needs_validation | not_found | error | pending
  match_source text,                            -- external_id | code | reference | sku | name | manual
  last_sync_at timestamptz,
  candidates jsonb,                             -- when needs_validation
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_external_links_unique_link UNIQUE (product_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_pel_provider_ext ON public.product_external_links (provider, external_product_id);
CREATE INDEX IF NOT EXISTS idx_pel_status ON public.product_external_links (sync_status);
CREATE INDEX IF NOT EXISTS idx_pel_company ON public.product_external_links (company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_external_links TO authenticated;
GRANT ALL ON public.product_external_links TO service_role;

ALTER TABLE public.product_external_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read product external links"
  ON public.product_external_links FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert product external links"
  ON public.product_external_links FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update product external links"
  ON public.product_external_links FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete product external links"
  ON public.product_external_links FOR DELETE
  TO authenticated USING (true);

CREATE TRIGGER trg_pel_updated_at
  BEFORE UPDATE ON public.product_external_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_pel_company_id
  BEFORE INSERT ON public.product_external_links
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_profile();

-- =========================================================
-- sync_execution_logs: histórico de execuções
-- =========================================================
CREATE TABLE IF NOT EXISTS public.sync_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  provider text NOT NULL,
  action text NOT NULL,               -- full_sync | manual_link | single_sync | bulk_sync
  triggered_by uuid,
  triggered_by_name text,
  targets_count integer DEFAULT 0,
  updated_count integer DEFAULT 0,
  linked_count integer DEFAULT 0,
  needs_validation_count integer DEFAULT 0,
  not_found_count integer DEFAULT 0,
  errors_count integer DEFAULT 0,
  duration_ms integer,
  summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sel_provider_created ON public.sync_execution_logs (provider, created_at DESC);

GRANT SELECT ON public.sync_execution_logs TO authenticated;
GRANT ALL ON public.sync_execution_logs TO service_role;

ALTER TABLE public.sync_execution_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read sync logs"
  ON public.sync_execution_logs FOR SELECT
  TO authenticated USING (true);

-- Writes only via service role (edge functions). No insert/update/delete policies for authenticated.

-- =========================================================
-- Backfill from existing products.loja_integrada_id
-- =========================================================
INSERT INTO public.product_external_links (product_id, provider, external_product_id, external_sku, external_code, external_name, sync_status, match_source, last_sync_at, company_id)
SELECT
  p.id,
  'loja_integrada',
  p.loja_integrada_id,
  p.sku,
  p.code,
  p.name,
  CASE WHEN p.logistica_atualizada_em IS NOT NULL THEN 'linked' ELSE 'linked' END,
  COALESCE(p.loja_integrada_sync_source, 'backfill'),
  p.logistica_atualizada_em,
  p.company_id
FROM public.products p
WHERE p.loja_integrada_id IS NOT NULL
ON CONFLICT (product_id, provider) DO NOTHING;
