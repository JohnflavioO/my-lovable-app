
CREATE TABLE public.assistant_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT,
  tool_used TEXT,
  result_json JSONB,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_conversations TO authenticated;
GRANT ALL ON public.assistant_conversations TO service_role;

ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own assistant conversations"
ON public.assistant_conversations
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_assistant_conversations_user_created ON public.assistant_conversations(user_id, created_at DESC);

CREATE TRIGGER trg_assistant_conversations_updated
BEFORE UPDATE ON public.assistant_conversations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
