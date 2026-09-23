
-- 1. Extend assistant_conversations
ALTER TABLE public.assistant_conversations
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS company_id uuid;

ALTER TABLE public.assistant_conversations ALTER COLUMN question DROP NOT NULL;

-- Backfill company_id from profiles
UPDATE public.assistant_conversations c
SET company_id = p.company_id
FROM public.profiles p
WHERE c.company_id IS NULL AND p.user_id = c.user_id;

-- Backfill title from question when missing
UPDATE public.assistant_conversations
SET title = LEFT(COALESCE(NULLIF(title, ''), question, 'Conversa'), 80)
WHERE title IS NULL OR title = '';

-- Auto-fill company_id on insert
DROP TRIGGER IF EXISTS trg_assistant_conv_company ON public.assistant_conversations;
CREATE TRIGGER trg_assistant_conv_company
BEFORE INSERT ON public.assistant_conversations
FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_profile();

CREATE INDEX IF NOT EXISTS idx_assistant_conv_user_updated
  ON public.assistant_conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_conv_company
  ON public.assistant_conversations(company_id);

-- 2. Create assistant_messages
CREATE TABLE IF NOT EXISTS public.assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.assistant_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  content text,
  tool_name text,
  tool_args jsonb,
  tool_result jsonb,
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  execution_time_ms integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_messages TO authenticated;
GRANT ALL ON public.assistant_messages TO service_role;

ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own messages"
ON public.assistant_messages
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.assistant_conversations c
    WHERE c.id = assistant_messages.conversation_id
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.assistant_conversations c
    WHERE c.id = assistant_messages.conversation_id
      AND c.user_id = auth.uid()
  )
);

CREATE POLICY "Admins and managers can view company messages"
ON public.assistant_messages
FOR SELECT
USING (
  (public.is_admin() OR public.is_gestor())
  AND EXISTS (
    SELECT 1 FROM public.assistant_conversations c
    WHERE c.id = assistant_messages.conversation_id
      AND c.company_id = public.current_user_company_id()
  )
);

CREATE INDEX IF NOT EXISTS idx_assistant_msg_conv_created
  ON public.assistant_messages(conversation_id, created_at ASC);

-- 3. Extra select policy on conversations for admins/managers (future team view)
DROP POLICY IF EXISTS "Admins and managers can view company conversations" ON public.assistant_conversations;
CREATE POLICY "Admins and managers can view company conversations"
ON public.assistant_conversations
FOR SELECT
USING (
  (public.is_admin() OR public.is_gestor())
  AND company_id = public.current_user_company_id()
);
