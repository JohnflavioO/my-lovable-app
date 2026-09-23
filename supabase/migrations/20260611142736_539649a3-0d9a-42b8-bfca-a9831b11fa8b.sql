CREATE TABLE public.contract_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.generated_contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID, -- Referência opcional à empresa/filial MCI
  client_name TEXT NOT NULL,
  client_document TEXT NOT NULL,
  responsible_name TEXT,
  responsible_phone TEXT,
  total_value NUMERIC(15,2),
  delivery_forecast TEXT,
  status TEXT DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'enviado', 'assinado', 'cancelado')),
  contract_data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  pdf_url TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_templates TO authenticated;
GRANT ALL ON public.contract_templates TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_contracts TO authenticated;
GRANT ALL ON public.generated_contracts TO service_role;

-- Enable RLS
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_contracts ENABLE ROW LEVEL SECURITY;

-- Policies for contract_templates
CREATE POLICY "Admins and Managers can manage templates" ON public.contract_templates
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role IN ('admin', 'gestor'))
    )
  );

CREATE POLICY "All authenticated users can view active templates" ON public.contract_templates
  FOR SELECT TO authenticated
  USING (active = true);

-- Policies for generated_contracts
CREATE POLICY "Users can manage contracts" ON public.generated_contracts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role IN ('admin', 'gestor', 'vendedor', 'comercial', 'financeiro'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role IN ('admin', 'gestor', 'vendedor', 'comercial', 'financeiro'))
    )
  );

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_contract_templates_updated_at BEFORE UPDATE ON public.contract_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_generated_contracts_updated_at BEFORE UPDATE ON public.generated_contracts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert initial template
INSERT INTO public.contract_templates (name, type, content)
VALUES ('Contrato de Pré-venda e Entrega Futura', 'pre-venda', 'CONTRATO DE PRÉ-VENDA E ENTREGA FUTURA...');
