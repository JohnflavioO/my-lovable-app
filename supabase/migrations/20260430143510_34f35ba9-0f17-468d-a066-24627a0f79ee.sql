-- Tabela de Boletos
CREATE TABLE public.bank_slips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dda TEXT,
  reminder TEXT,
  classification TEXT,
  nfe_number TEXT,
  client_name TEXT NOT NULL,
  principal_amount NUMERIC NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  payment_date DATE,
  interest_amount NUMERIC NOT NULL DEFAULT 0,
  fine_amount NUMERIC NOT NULL DEFAULT 0,
  updated_amount NUMERIC NOT NULL DEFAULT 0,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'Em aberto',
  salesperson_name TEXT,
  notes TEXT,
  company_id UUID,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de Histórico
CREATE TABLE public.bank_slip_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_slip_id UUID REFERENCES public.bank_slips(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  prev_status TEXT,
  new_status TEXT,
  notes TEXT,
  performed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índice de unicidade para importação
CREATE UNIQUE INDEX idx_bank_slips_unique_import ON public.bank_slips (COALESCE(nfe_number, ''), client_name, due_date, principal_amount);

-- Ativar RLS
ALTER TABLE public.bank_slips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_slip_history ENABLE ROW LEVEL SECURITY;

-- Políticas para bank_slips
CREATE POLICY "Financeiro pode tudo em boletos"
ON public.bank_slips
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'financeiro')
  )
);

CREATE POLICY "Gestor pode visualizar boletos"
ON public.bank_slips
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'gestor'
  )
);

-- Políticas para bank_slip_history
CREATE POLICY "Financeiro e Gestor podem ver histórico de boletos"
ON public.bank_slip_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'financeiro', 'gestor')
  )
);

CREATE POLICY "Financeiro pode inserir histórico"
ON public.bank_slip_history
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'financeiro')
  )
);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_bank_slips_updated_at
BEFORE UPDATE ON public.bank_slips
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();