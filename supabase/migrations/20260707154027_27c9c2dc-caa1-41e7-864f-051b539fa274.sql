-- 1) Product weight & dimension fields
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS peso_kg numeric,
  ADD COLUMN IF NOT EXISTS altura_cm numeric,
  ADD COLUMN IF NOT EXISTS largura_cm numeric,
  ADD COLUMN IF NOT EXISTS comprimento_cm numeric,
  ADD COLUMN IF NOT EXISTS peso_cubado numeric,
  ADD COLUMN IF NOT EXISTS volume_m3 numeric,
  ADD COLUMN IF NOT EXISTS origem_cep text,
  ADD COLUMN IF NOT EXISTS embalagem_tipo text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Global CEP de origem (evolução futura: múltiplos centros de distribuição)
INSERT INTO public.system_settings (key, value)
VALUES ('cep_origem_global', jsonb_build_object('cep', '', 'centros', '[]'::jsonb))
ON CONFLICT (key) DO NOTHING;

-- 3) Histórico de cotações de frete por orçamento
CREATE TABLE IF NOT EXISTS public.quote_freight_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  carrier text,
  service text,
  cep_origem text,
  cep_destino text,
  peso_total_kg numeric,
  peso_cubado_kg numeric,
  volume_m3 numeric,
  volumes_qtd integer,
  altura_cm numeric,
  largura_cm numeric,
  comprimento_cm numeric,
  valor_mercadoria numeric,
  valor_frete numeric,
  prazo_dias integer,
  notes text,
  raw_payload jsonb,
  source text NOT NULL DEFAULT 'manual',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_freight_quotes TO authenticated;
GRANT ALL ON public.quote_freight_quotes TO service_role;

ALTER TABLE public.quote_freight_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quote_freight_quotes select by role"
  ON public.quote_freight_quotes FOR SELECT TO authenticated
  USING (
    is_admin() OR is_gestor() OR is_logistica()
    OR EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_freight_quotes.quote_id AND q.created_by = auth.uid()
    )
  );

CREATE POLICY "quote_freight_quotes insert by owner or manager"
  ON public.quote_freight_quotes FOR INSERT TO authenticated
  WITH CHECK (
    is_admin() OR is_gestor() OR is_logistica()
    OR EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_freight_quotes.quote_id AND q.created_by = auth.uid()
    )
  );

CREATE POLICY "quote_freight_quotes update by owner or manager"
  ON public.quote_freight_quotes FOR UPDATE TO authenticated
  USING (
    is_admin() OR is_gestor() OR is_logistica()
    OR EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_freight_quotes.quote_id AND q.created_by = auth.uid()
    )
  );

CREATE POLICY "quote_freight_quotes delete by owner or manager"
  ON public.quote_freight_quotes FOR DELETE TO authenticated
  USING (
    is_admin() OR is_gestor()
    OR EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_freight_quotes.quote_id AND q.created_by = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS trg_qfq_updated_at ON public.quote_freight_quotes;
CREATE TRIGGER trg_qfq_updated_at
  BEFORE UPDATE ON public.quote_freight_quotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_qfq_quote_id ON public.quote_freight_quotes(quote_id);
CREATE INDEX IF NOT EXISTS idx_qfq_created_at ON public.quote_freight_quotes(created_at DESC);