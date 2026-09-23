
-- Clients: add missing columns
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS cpf_cnpj text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS address_number text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS complement text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS neighborhood text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS cep text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS contrib_icms text;

-- Copy name -> company_name for existing rows
UPDATE public.clients SET company_name = name WHERE company_name IS NULL AND name IS NOT NULL;

-- Quotes: add missing columns
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS total_amount numeric DEFAULT 0;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS salesperson_id uuid;

-- Copy total -> total_amount for existing rows
UPDATE public.quotes SET total_amount = total WHERE total_amount IS NULL OR total_amount = 0;

-- Quote Items: add missing columns
ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS model text DEFAULT '';
ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS brand text DEFAULT '';
ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS specifications text DEFAULT '';
ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS discount_percent numeric DEFAULT 0;
ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS unit_total numeric DEFAULT 0;
ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS line_total numeric DEFAULT 0;
ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS product_code text DEFAULT '';

-- Copy description -> model for existing items
UPDATE public.quote_items SET model = description WHERE model = '' AND description != '';
UPDATE public.quote_items SET line_total = total_price WHERE line_total = 0 AND total_price > 0;
UPDATE public.quote_items SET unit_total = unit_price WHERE unit_total = 0 AND unit_price > 0;
