ALTER TABLE public.quotes 
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS shipping_deadline text,
  ADD COLUMN IF NOT EXISTS shipping_method text;