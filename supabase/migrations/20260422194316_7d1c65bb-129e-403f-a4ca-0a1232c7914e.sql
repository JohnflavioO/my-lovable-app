-- Create import_logs table
CREATE TABLE public.import_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    type TEXT NOT NULL,
    source_url TEXT,
    status TEXT NOT NULL, -- 'success', 'error'
    message TEXT,
    records_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own import logs"
    ON public.import_logs
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own import logs"
    ON public.import_logs
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Index for performance
CREATE INDEX idx_import_logs_user_id ON public.import_logs(user_id);
CREATE INDEX idx_import_logs_created_at ON public.import_logs(created_at DESC);
