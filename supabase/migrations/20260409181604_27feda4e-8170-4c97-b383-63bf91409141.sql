-- Create financial action history table
CREATE TABLE public.financial_action_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  financial_record_id UUID NOT NULL REFERENCES public.financial_records(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  performed_by UUID NOT NULL,
  performed_by_name TEXT,
  previous_status TEXT,
  new_status TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.financial_action_history ENABLE ROW LEVEL SECURITY;

-- Financeiro and Gestor can view history
CREATE POLICY "Financeiro and Gestor can view action history"
  ON public.financial_action_history
  FOR SELECT
  TO authenticated
  USING (is_financeiro() OR is_gestor());

-- Financeiro can insert history
CREATE POLICY "Financeiro can insert action history"
  ON public.financial_action_history
  FOR INSERT
  TO authenticated
  WITH CHECK (is_financeiro());

-- Create index for performance
CREATE INDEX idx_financial_action_history_record ON public.financial_action_history(financial_record_id);
CREATE INDEX idx_financial_action_history_created ON public.financial_action_history(created_at DESC);