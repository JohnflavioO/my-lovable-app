
-- Create is_financeiro function
CREATE OR REPLACE FUNCTION public.is_financeiro()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'financeiro'
  )
$$;

-- Create financial_records table
CREATE TABLE public.financial_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  client_name text NOT NULL DEFAULT '',
  client_id uuid,
  total_amount numeric NOT NULL DEFAULT 0,
  payment_method text,
  due_date date,
  paid_date date,
  amount_paid numeric DEFAULT 0,
  financial_status text NOT NULL DEFAULT 'aguardando_pagamento',
  financial_notes text,
  baixa_by uuid,
  baixa_at timestamp with time zone,
  installment_number integer DEFAULT 1,
  installments_total integer DEFAULT 1,
  external_order_id text,
  source text DEFAULT 'manual',
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.financial_records ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Financeiro, Gestor, Admin can view financial records"
ON public.financial_records FOR SELECT TO authenticated
USING (is_admin() OR is_gestor() OR is_financeiro());

CREATE POLICY "Financeiro and Admin can insert financial records"
ON public.financial_records FOR INSERT TO authenticated
WITH CHECK (is_admin() OR is_financeiro());

CREATE POLICY "Financeiro and Admin can update financial records"
ON public.financial_records FOR UPDATE TO authenticated
USING (is_admin() OR is_financeiro());

CREATE POLICY "Admin can delete financial records"
ON public.financial_records FOR DELETE TO authenticated
USING (is_admin());

-- Index for performance
CREATE INDEX idx_financial_records_quote_id ON public.financial_records(quote_id);
CREATE INDEX idx_financial_records_status ON public.financial_records(financial_status);
CREATE INDEX idx_financial_records_due_date ON public.financial_records(due_date);

-- Trigger to auto-create financial records when quote is approved
CREATE OR REPLACE FUNCTION public.create_financial_record_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only when status changes to approved and payment is boleto or pix
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'approved')
     AND (NEW.payment_method IN ('boleto', 'pix'))
  THEN
    -- Don't create duplicate
    IF NOT EXISTS (SELECT 1 FROM public.financial_records WHERE quote_id = NEW.id) THEN
      INSERT INTO public.financial_records (
        quote_id, client_name, client_id, total_amount, payment_method,
        due_date, installments_total, source, created_by, financial_status
      ) VALUES (
        NEW.id,
        NEW.client_name,
        NEW.client_id,
        COALESCE(NEW.total_amount, NEW.total, 0),
        NEW.payment_method,
        COALESCE(NEW.payment_date, CURRENT_DATE + INTERVAL '30 days'),
        COALESCE(NEW.installments, 1),
        COALESCE(NEW.source, 'manual'),
        NEW.created_by,
        'aguardando_pagamento'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_financial_on_approval
AFTER UPDATE ON public.quotes
FOR EACH ROW
EXECUTE FUNCTION public.create_financial_record_on_approval();
