
ALTER TABLE public.quotes
ADD COLUMN payment_method text DEFAULT NULL,
ADD COLUMN payment_status text DEFAULT 'pendente';
