-- Create technical_maintenances table
CREATE TABLE public.technical_maintenances (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID REFERENCES public.technical_products(id) ON DELETE SET NULL,
    brand TEXT,
    model TEXT,
    description TEXT,
    technician TEXT,
    status TEXT DEFAULT 'Aguardando',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.technical_maintenances ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Enable read access for authenticated users" 
ON public.technical_maintenances FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Enable insert access for authenticated users" 
ON public.technical_maintenances FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users" 
ON public.technical_maintenances FOR UPDATE 
TO authenticated 
USING (true);

CREATE POLICY "Enable delete access for authenticated users" 
ON public.technical_maintenances FOR DELETE 
TO authenticated 
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_technical_maintenances_updated_at
BEFORE UPDATE ON public.technical_maintenances
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();