-- Add unique constraint to external_order_id if it's not null
-- First, remove any existing duplicates if they exist (keep the newest one)
DELETE FROM public.quotes q1
USING public.quotes q2
WHERE q1.id < q2.id 
  AND q1.external_order_id = q2.external_order_id 
  AND q1.external_order_id IS NOT NULL;

-- Now add the unique constraint
ALTER TABLE public.quotes ADD CONSTRAINT quotes_external_order_id_unique UNIQUE (external_order_id);