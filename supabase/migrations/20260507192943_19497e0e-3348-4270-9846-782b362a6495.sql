-- Brands table
CREATE TABLE IF NOT EXISTS public.technical_brands (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Ensure RLS on brands
ALTER TABLE public.technical_brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can view brands" ON public.technical_brands FOR SELECT USING (true);
CREATE POLICY "Admins and technicians can manage brands" ON public.technical_brands FOR ALL USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'support_tech', 'support_manager')));

-- Update technical_clients
ALTER TABLE public.technical_clients 
ADD COLUMN IF NOT EXISTS document_type TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS zip_code TEXT;

-- Update technical_products
ALTER TABLE public.technical_products 
ADD COLUMN IF NOT EXISTS brand TEXT,
ADD COLUMN IF NOT EXISTS unit_price DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Update technical_orders
ALTER TABLE public.technical_orders 
ADD COLUMN IF NOT EXISTS os_type TEXT DEFAULT 'Corretiva',
ADD COLUMN IF NOT EXISTS entry_date DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS exit_date DATE,
ADD COLUMN IF NOT EXISTS technician_notes TEXT,
ADD COLUMN IF NOT EXISTS parts_value DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS services_value DECIMAL(12,2) DEFAULT 0;

-- Maintenance log (internal or for small repairs not full OS)
CREATE TABLE IF NOT EXISTS public.technical_maintenances (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    brand TEXT,
    model TEXT,
    description TEXT,
    technician TEXT,
    status TEXT DEFAULT 'Aguardando',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.technical_maintenances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Technicians can manage maintenance" ON public.technical_maintenances FOR ALL USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'support_tech', 'support_manager')));
