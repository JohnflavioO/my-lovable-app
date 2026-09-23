-- Add integration tracking fields to quotes
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS external_order_id text,
  ADD COLUMN IF NOT EXISTS external_status text;

-- Unique index to prevent duplicate imports
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_external_order_id
  ON public.quotes (external_order_id)
  WHERE external_order_id IS NOT NULL;
