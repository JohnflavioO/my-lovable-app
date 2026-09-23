CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON public.products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_sku_trgm ON public.products USING gin (sku gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_brand_trgm ON public.products USING gin (brand gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_code_trgm ON public.products USING gin (code gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_description_trgm ON public.products USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_category_trgm ON public.products USING gin (category_principal gin_trgm_ops);