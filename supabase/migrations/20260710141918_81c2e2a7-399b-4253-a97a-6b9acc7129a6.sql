CREATE INDEX IF NOT EXISTS idx_quotes_status_updated_at ON public.quotes (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_company_updated_at ON public.quotes (company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at_desc ON public.quotes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_company_updated_at ON public.products (company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_updated_at_desc ON public.products (updated_at DESC);