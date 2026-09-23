ALTER TABLE public.technical_purchase_orders 
ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'Compra',
ADD COLUMN IF NOT EXISTS purchase_date DATE DEFAULT CURRENT_DATE;