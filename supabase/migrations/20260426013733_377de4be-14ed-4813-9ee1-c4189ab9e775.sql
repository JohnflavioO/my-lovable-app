-- Adicionar campo de follow-up na tabela de orçamentos se não existir
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'followup_date') THEN
        ALTER TABLE public.quotes ADD COLUMN followup_date TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Criar tabela para evitar duplicidade de notificações de follow-up no mesmo dia
CREATE TABLE IF NOT EXISTS public.followup_notification_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL, -- 'today', 'overdue', 'forgotten', 'no_return'
    notified_at DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(quote_id, user_id, notification_type, notified_at)
);

-- Habilitar RLS
ALTER TABLE public.followup_notification_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para followup_notification_logs
CREATE POLICY "Users can view their own notification logs"
ON public.followup_notification_logs
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notification logs"
ON public.followup_notification_logs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_quotes_followup_date ON public.quotes(followup_date);
CREATE INDEX IF NOT EXISTS idx_followup_logs_composite ON public.followup_notification_logs(quote_id, user_id, notification_type, notified_at);
