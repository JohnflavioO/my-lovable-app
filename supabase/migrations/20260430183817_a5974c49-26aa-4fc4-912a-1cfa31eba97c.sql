-- Add new columns to bank_slips
ALTER TABLE public.bank_slips 
ADD COLUMN IF NOT EXISTS dda TEXT DEFAULT 'NÃO',
ADD COLUMN IF NOT EXISTS lembrete TEXT;

-- Create bank_slip_history table
CREATE TABLE IF NOT EXISTS public.bank_slip_history (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    bank_slip_id UUID NOT NULL REFERENCES public.bank_slips(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bank_slips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_slip_history ENABLE ROW LEVEL SECURITY;

-- Policies for bank_slips (assuming existing policies exist, we just ensure update is possible)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'bank_slips' AND policyname = 'Users can update bank_slips'
    ) THEN
        CREATE POLICY "Users can update bank_slips" ON public.bank_slips
            FOR UPDATE USING (true) WITH CHECK (true);
    END IF;
END $$;

-- Policies for history
CREATE POLICY "Anyone can view history" ON public.bank_slip_history
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert history" ON public.bank_slip_history
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
