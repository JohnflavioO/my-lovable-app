-- Table for product relationships (compatibility)
CREATE TABLE public.product_relationships (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    related_product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    tipo_relacao TEXT NOT NULL CHECK (tipo_relacao IN ('cross_sell', 'upsell', 'acessorio', 'upgrade', 'reposicao')),
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS for product_relationships
ALTER TABLE public.product_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Product relationships are viewable by everyone" 
ON public.product_relationships FOR SELECT USING (true);

CREATE POLICY "Admins can manage product relationships" 
ON public.product_relationships FOR ALL 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role IN ('admin', 'gestor')));

-- Table for smart opportunities
CREATE TABLE public.smart_opportunities (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    vendedor_id UUID REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    produto_base UUID REFERENCES public.products(id),
    produto_sugerido UUID REFERENCES public.products(id),
    tipo_oportunidade TEXT NOT NULL CHECK (tipo_oportunidade IN ('Cross-sell', 'Upsell', 'Reativação', 'Lançamento compatível', 'Acessório recomendado', 'Upgrade de equipamento')),
    motivo TEXT,
    prioridade TEXT DEFAULT 'média' CHECK (prioridade IN ('alta', 'média', 'baixa')),
    status TEXT NOT NULL DEFAULT 'Nova' CHECK (status IN ('Nova', 'Em contato', 'Follow-up agendado', 'Convertida', 'Descartada')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS for smart opportunities
ALTER TABLE public.smart_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own opportunities" 
ON public.smart_opportunities FOR SELECT 
USING (
    vendedor_id = auth.uid() OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'gestor')
);

CREATE POLICY "Users can update their own opportunities" 
ON public.smart_opportunities FOR UPDATE 
USING (
    vendedor_id = auth.uid() OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'gestor')
);

CREATE POLICY "System/Admins can insert opportunities" 
ON public.smart_opportunities FOR INSERT 
WITH CHECK (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_product_relationships_updated_at
BEFORE UPDATE ON public.product_relationships
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_smart_opportunities_updated_at
BEFORE UPDATE ON public.smart_opportunities
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
