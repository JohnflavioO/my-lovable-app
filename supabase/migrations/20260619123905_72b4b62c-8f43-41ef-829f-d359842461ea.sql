ALTER TABLE public.technical_orders
  ADD COLUMN IF NOT EXISTS physical_condition text,
  ADD COLUMN IF NOT EXISTS accessories jsonb NOT NULL DEFAULT '[]'::jsonb;