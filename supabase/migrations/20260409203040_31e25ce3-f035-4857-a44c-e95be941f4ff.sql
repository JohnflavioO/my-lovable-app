
-- 1. Create is_logistica function
CREATE OR REPLACE FUNCTION public.is_logistica()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'logistica'
  )
$$;

-- 2. Create logistics_records table
CREATE TABLE public.logistics_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  logistics_status TEXT NOT NULL DEFAULT 'aguardando_entrada',
  nf_numero TEXT,
  nf_data DATE,
  codigo_rastreio TEXT,
  transportadora TEXT,
  observacao_logistica TEXT,
  data_envio DATE,
  data_entrega DATE,
  entrada_by UUID,
  entrada_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(quote_id)
);

-- 3. Enable RLS
ALTER TABLE public.logistics_records ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

-- Logistica can do everything
CREATE POLICY "Logistica can view all logistics records"
ON public.logistics_records FOR SELECT
TO authenticated
USING (is_logistica());

CREATE POLICY "Logistica can insert logistics records"
ON public.logistics_records FOR INSERT
TO authenticated
WITH CHECK (is_logistica());

CREATE POLICY "Logistica can update logistics records"
ON public.logistics_records FOR UPDATE
TO authenticated
USING (is_logistica());

CREATE POLICY "Logistica can delete logistics records"
ON public.logistics_records FOR DELETE
TO authenticated
USING (is_logistica());

-- Gestor and Admin can view all
CREATE POLICY "Gestor can view all logistics records"
ON public.logistics_records FOR SELECT
TO authenticated
USING (is_gestor());

CREATE POLICY "Admin can view all logistics records"
ON public.logistics_records FOR SELECT
TO authenticated
USING (is_admin());

-- Sellers can view logistics for their own quotes
CREATE POLICY "Sellers can view own quote logistics"
ON public.logistics_records FOR SELECT
TO authenticated
USING (
  is_approved() AND EXISTS (
    SELECT 1 FROM public.quotes
    WHERE quotes.id = logistics_records.quote_id
    AND quotes.created_by = auth.uid()
  )
);

-- 5. Create trigger to auto-create logistics record on quote approval
CREATE OR REPLACE FUNCTION public.create_logistics_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'approved') THEN
    IF NOT EXISTS (SELECT 1 FROM public.logistics_records WHERE quote_id = NEW.id) THEN
      INSERT INTO public.logistics_records (quote_id, logistics_status)
      VALUES (NEW.id, 'aguardando_entrada');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_logistics_on_approval
AFTER UPDATE ON public.quotes
FOR EACH ROW
EXECUTE FUNCTION public.create_logistics_on_approval();

-- 6. Logistics action history table
CREATE TABLE public.logistics_action_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  logistics_record_id UUID NOT NULL REFERENCES public.logistics_records(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  notes TEXT,
  performed_by UUID NOT NULL,
  performed_by_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.logistics_action_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Logistica and Gestor can view logistics history"
ON public.logistics_action_history FOR SELECT
TO authenticated
USING (is_logistica() OR is_gestor() OR is_admin());

CREATE POLICY "Logistica can insert logistics history"
ON public.logistics_action_history FOR INSERT
TO authenticated
WITH CHECK (is_logistica());

-- Sellers can view history for their own quotes
CREATE POLICY "Sellers can view own logistics history"
ON public.logistics_action_history FOR SELECT
TO authenticated
USING (
  is_approved() AND EXISTS (
    SELECT 1 FROM public.logistics_records lr
    JOIN public.quotes q ON q.id = lr.quote_id
    WHERE lr.id = logistics_action_history.logistics_record_id
    AND q.created_by = auth.uid()
  )
);

-- 7. Also create logistics records for already-approved quotes
INSERT INTO public.logistics_records (quote_id, logistics_status)
SELECT q.id, 'aguardando_entrada'
FROM public.quotes q
WHERE q.status = 'approved'
AND NOT EXISTS (SELECT 1 FROM public.logistics_records lr WHERE lr.quote_id = q.id);
