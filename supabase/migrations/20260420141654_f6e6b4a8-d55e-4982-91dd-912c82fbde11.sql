ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS use_alt_shipping_address boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shipping_recipient text,
  ADD COLUMN IF NOT EXISTS shipping_cep text,
  ADD COLUMN IF NOT EXISTS shipping_address text,
  ADD COLUMN IF NOT EXISTS shipping_address_number text,
  ADD COLUMN IF NOT EXISTS shipping_complement text,
  ADD COLUMN IF NOT EXISTS shipping_neighborhood text,
  ADD COLUMN IF NOT EXISTS shipping_city text,
  ADD COLUMN IF NOT EXISTS shipping_state text,
  ADD COLUMN IF NOT EXISTS shipping_phone text,
  ADD COLUMN IF NOT EXISTS shipping_notes text;