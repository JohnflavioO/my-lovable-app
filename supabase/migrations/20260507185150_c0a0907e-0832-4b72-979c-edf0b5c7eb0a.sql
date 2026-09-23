ALTER TABLE public.technical_products ADD COLUMN IF NOT EXISTS unit_measure text;

-- Update categories/brands if necessary, but we'll manage them in the UI or a separate table
-- For now just ensure the column exists.
