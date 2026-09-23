
-- Add pipeline stage to clients
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS pipeline_stage text NOT NULL DEFAULT 'lead',
ADD COLUMN IF NOT EXISTS last_interaction_at timestamp with time zone DEFAULT now();

-- Add public token and approval timestamps to quotes
ALTER TABLE public.quotes
ADD COLUMN IF NOT EXISTS public_token text UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS rejected_at timestamp with time zone;

-- Create index on public_token for fast lookups
CREATE INDEX IF NOT EXISTS idx_quotes_public_token ON public.quotes(public_token);

-- Create index on pipeline_stage
CREATE INDEX IF NOT EXISTS idx_clients_pipeline_stage ON public.clients(pipeline_stage);

-- Create index on last_interaction_at for follow-up queries
CREATE INDEX IF NOT EXISTS idx_clients_last_interaction ON public.clients(last_interaction_at);

-- Allow public (anonymous) access to view a quote by its public token
CREATE POLICY "Public can view quote by token"
ON public.quotes
FOR SELECT
TO anon
USING (public_token IS NOT NULL);

-- Allow public to view quote items for quotes with public token
CREATE POLICY "Public can view quote items by token"
ON public.quote_items
FOR SELECT
TO anon
USING (EXISTS (
  SELECT 1 FROM public.quotes 
  WHERE quotes.id = quote_items.quote_id 
  AND quotes.public_token IS NOT NULL
));

-- Allow public to update quote status (approve/reject) via token
CREATE POLICY "Public can update quote status by token"
ON public.quotes
FOR UPDATE
TO anon
USING (public_token IS NOT NULL)
WITH CHECK (public_token IS NOT NULL);
