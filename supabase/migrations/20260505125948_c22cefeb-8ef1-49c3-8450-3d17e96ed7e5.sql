-- Create the batch table
CREATE TABLE public.financial_import_batches (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL,
    filename TEXT NOT NULL,
    import_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    imported_by UUID NOT NULL REFERENCES auth.users(id),
    total_records INTEGER NOT NULL DEFAULT 0,
    total_value NUMERIC(15, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'arquivado')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.financial_import_batches ENABLE ROW LEVEL SECURITY;

-- Policies for financial_import_batches
CREATE POLICY "Users can view batches from their company" 
ON public.financial_import_batches 
FOR SELECT 
USING (
    company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
);

CREATE POLICY "Users can insert batches for their company" 
ON public.financial_import_batches 
FOR INSERT 
WITH CHECK (
    company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
);

CREATE POLICY "Users can update batches from their company" 
ON public.financial_import_batches 
FOR UPDATE 
USING (
    company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
);

CREATE POLICY "Users can delete batches from their company" 
ON public.financial_import_batches 
FOR DELETE 
USING (
    company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
);

-- Clear old IDs to avoid FK issues
UPDATE public.bank_slips SET import_batch_id = NULL;

-- Add foreign key constraint
ALTER TABLE public.bank_slips 
ADD CONSTRAINT bank_slips_import_batch_id_fkey 
FOREIGN KEY (import_batch_id) REFERENCES public.financial_import_batches(id) ON DELETE CASCADE;

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_financial_import_batches_updated_at
BEFORE UPDATE ON public.financial_import_batches
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
