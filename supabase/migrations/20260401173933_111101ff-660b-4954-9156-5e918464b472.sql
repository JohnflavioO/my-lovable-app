
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS shipping_cost numeric DEFAULT 0;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS proposal_validity text DEFAULT '15 dias';
