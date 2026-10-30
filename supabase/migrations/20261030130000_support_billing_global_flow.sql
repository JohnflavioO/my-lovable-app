-- Shared billing integration metadata for technical-support budgets.
ALTER TABLE public.technical_orders
  ADD COLUMN IF NOT EXISTS billing_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_order_number text,
  ADD COLUMN IF NOT EXISTS billing_send_status text NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS billing_send_error text;

UPDATE public.technical_orders
SET billing_send_status = 'not_sent'
WHERE billing_send_status IS NULL;

CREATE INDEX IF NOT EXISTS technical_orders_billing_send_status_idx
  ON public.technical_orders (billing_send_status)
  WHERE billing_sent_at IS NULL;
