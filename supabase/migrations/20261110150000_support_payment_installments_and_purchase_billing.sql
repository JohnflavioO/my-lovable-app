ALTER TABLE public.technical_orders
  ADD COLUMN IF NOT EXISTS payment_installments integer NOT NULL DEFAULT 1;
ALTER TABLE public.technical_orders
  DROP CONSTRAINT IF EXISTS technical_orders_payment_installments_check;
ALTER TABLE public.technical_orders
  ADD CONSTRAINT technical_orders_payment_installments_check
  CHECK (payment_installments BETWEEN 1 AND 24);

ALTER TABLE public.technical_purchase_orders
  ADD COLUMN IF NOT EXISTS billing_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_order_number text,
  ADD COLUMN IF NOT EXISTS billing_send_status text NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS billing_send_error text;

ALTER TABLE public.technical_purchase_orders
  DROP CONSTRAINT IF EXISTS technical_purchase_orders_billing_send_status_check;
ALTER TABLE public.technical_purchase_orders
  ADD CONSTRAINT technical_purchase_orders_billing_send_status_check
  CHECK (billing_send_status IN ('not_sent','sending','sent'));
