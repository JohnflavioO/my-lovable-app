CREATE TABLE IF NOT EXISTS public.cnpj_lookup_cache (
  cnpj text PRIMARY KEY,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cnpj_lookup_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cnpj_lookup_cache FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.cnpj_lookup_cache TO service_role;
CREATE INDEX IF NOT EXISTS idx_cnpj_lookup_cache_fetched_at ON public.cnpj_lookup_cache (fetched_at DESC);