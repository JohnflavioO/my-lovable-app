-- Add NF integration fields to logistics_records
ALTER TABLE public.logistics_records
  ADD COLUMN IF NOT EXISTS nf_chave_acesso text,
  ADD COLUMN IF NOT EXISTS nf_xml_url text,
  ADD COLUMN IF NOT EXISTS origem_nf text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS ultima_sincronizacao_nf timestamptz;

-- Index on nf_chave_acesso for fast lookup during webhook matching
CREATE INDEX IF NOT EXISTS idx_logistics_nf_chave ON public.logistics_records (nf_chave_acesso) WHERE nf_chave_acesso IS NOT NULL;

-- Index on quote_id + logistics_status for webhook order matching
CREATE INDEX IF NOT EXISTS idx_logistics_quote_status ON public.logistics_records (quote_id, logistics_status);