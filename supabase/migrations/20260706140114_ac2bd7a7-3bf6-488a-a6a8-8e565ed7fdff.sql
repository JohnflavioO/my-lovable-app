
CREATE TABLE public.assistant_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID,
  user_id UUID NOT NULL,
  conversation_id UUID,
  action_type TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  module TEXT,
  entity_type TEXT,
  entity_id TEXT,
  prompt TEXT,
  tool_input JSONB,
  tool_output JSONB,
  confirmation_required BOOLEAN NOT NULL DEFAULT true,
  confirmation_result TEXT,
  execution_status TEXT NOT NULL DEFAULT 'waiting_confirmation',
  execution_time_ms INTEGER,
  model TEXT,
  provider TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  estimated_cost NUMERIC(12,6),
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.assistant_audit_log TO authenticated;
GRANT ALL ON public.assistant_audit_log TO service_role;

ALTER TABLE public.assistant_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own audit"
  ON public.assistant_audit_log FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin() OR public.is_gestor());

CREATE INDEX idx_audit_company_created ON public.assistant_audit_log(company_id, created_at DESC);
CREATE INDEX idx_audit_user_created ON public.assistant_audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_action_type ON public.assistant_audit_log(action_type);
CREATE INDEX idx_audit_execution_status ON public.assistant_audit_log(execution_status);

CREATE TRIGGER trg_audit_updated
  BEFORE UPDATE ON public.assistant_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
