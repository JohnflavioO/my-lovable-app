
-- Create quote_messages table for internal chat
CREATE TABLE public.quote_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_name text NOT NULL DEFAULT '',
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.quote_messages ENABLE ROW LEVEL SECURITY;

-- SELECT policies
CREATE POLICY "Sellers can view messages on own quotes"
ON public.quote_messages FOR SELECT TO authenticated
USING (
  is_approved() AND EXISTS (
    SELECT 1 FROM public.quotes WHERE quotes.id = quote_messages.quote_id AND quotes.created_by = auth.uid()
  )
);

CREATE POLICY "Gestor can view all messages"
ON public.quote_messages FOR SELECT TO authenticated
USING (is_gestor());

CREATE POLICY "Admin can view all messages"
ON public.quote_messages FOR SELECT TO authenticated
USING (is_admin());

CREATE POLICY "Financeiro can view messages on financial quotes"
ON public.quote_messages FOR SELECT TO authenticated
USING (
  is_financeiro() AND EXISTS (
    SELECT 1 FROM public.financial_records WHERE financial_records.quote_id = quote_messages.quote_id
  )
);

CREATE POLICY "Logistica can view messages on logistics quotes"
ON public.quote_messages FOR SELECT TO authenticated
USING (
  is_logistica() AND EXISTS (
    SELECT 1 FROM public.logistics_records WHERE logistics_records.quote_id = quote_messages.quote_id
  )
);

-- INSERT policies
CREATE POLICY "Sellers can send messages on own quotes"
ON public.quote_messages FOR INSERT TO authenticated
WITH CHECK (
  is_approved() AND user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.quotes WHERE quotes.id = quote_messages.quote_id AND quotes.created_by = auth.uid()
  )
);

CREATE POLICY "Gestor can send messages"
ON public.quote_messages FOR INSERT TO authenticated
WITH CHECK (is_gestor() AND user_id = auth.uid());

CREATE POLICY "Admin can send messages"
ON public.quote_messages FOR INSERT TO authenticated
WITH CHECK (is_admin() AND user_id = auth.uid());

CREATE POLICY "Financeiro can send messages on financial quotes"
ON public.quote_messages FOR INSERT TO authenticated
WITH CHECK (
  is_financeiro() AND user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.financial_records WHERE financial_records.quote_id = quote_messages.quote_id
  )
);

CREATE POLICY "Logistica can send messages on logistics quotes"
ON public.quote_messages FOR INSERT TO authenticated
WITH CHECK (
  is_logistica() AND user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.logistics_records WHERE logistics_records.quote_id = quote_messages.quote_id
  )
);

-- Index for fast queries
CREATE INDEX idx_quote_messages_quote_id ON public.quote_messages(quote_id);
CREATE INDEX idx_quote_messages_created_at ON public.quote_messages(quote_id, created_at);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.quote_messages;
