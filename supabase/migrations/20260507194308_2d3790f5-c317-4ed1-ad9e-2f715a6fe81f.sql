-- Tabela de Fornecedores do Suporte
CREATE TABLE IF NOT EXISTS public.technical_suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    cnpj TEXT,
    contact_name TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de Catálogo de Serviços
CREATE TABLE IF NOT EXISTS public.technical_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    base_price NUMERIC(10, 2) DEFAULT 0,
    estimated_time TEXT,
    category TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de Ordens de Compra
CREATE TABLE IF NOT EXISTS public.technical_purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES public.technical_suppliers(id),
    status TEXT NOT NULL DEFAULT 'pendente', -- pendente, aprovada, recebida, cancelada
    total_amount NUMERIC(10, 2) DEFAULT 0,
    notes TEXT,
    expected_delivery DATE,
    received_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Itens da Ordem de Compra
CREATE TABLE IF NOT EXISTS public.technical_purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID REFERENCES public.technical_purchase_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.technical_products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    total_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de Orçamentos Técnicos
CREATE TABLE IF NOT EXISTS public.technical_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    technical_order_id UUID REFERENCES public.technical_orders(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.technical_clients(id),
    status TEXT NOT NULL DEFAULT 'rascunho', -- rascunho, enviado, aprovado, recusado
    valid_until DATE,
    total_services NUMERIC(10, 2) DEFAULT 0,
    total_parts NUMERIC(10, 2) DEFAULT 0,
    discount NUMERIC(10, 2) DEFAULT 0,
    total_amount NUMERIC(10, 2) DEFAULT 0,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela da Nuvem Técnica (Arquivos/Manuais)
CREATE TABLE IF NOT EXISTS public.technical_cloud_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    file_url TEXT NOT NULL,
    file_type TEXT,
    category TEXT, -- manual, esquema, firmware, outros
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.technical_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_cloud_files ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso
DO $$ 
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT table_name FROM information_schema.tables 
             WHERE table_name IN ('technical_suppliers', 'technical_services', 'technical_purchase_orders', 'technical_purchase_order_items', 'technical_budgets', 'technical_cloud_files') 
             AND table_schema = 'public'
    LOOP
        EXECUTE format('CREATE POLICY "Support Access" ON public.%I FOR ALL USING (
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE profiles.user_id = auth.uid()
                AND (profiles.role IN (''admin'', ''gestor'', ''support_tech'', ''support_manager''))
            )
        )', t);
    END LOOP;
END $$;

-- Triggers para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_technical_suppliers_updated_at BEFORE UPDATE ON public.technical_suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_technical_services_updated_at BEFORE UPDATE ON public.technical_services FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_technical_purchase_orders_updated_at BEFORE UPDATE ON public.technical_purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_technical_budgets_updated_at BEFORE UPDATE ON public.technical_budgets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_technical_cloud_files_updated_at BEFORE UPDATE ON public.technical_cloud_files FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
