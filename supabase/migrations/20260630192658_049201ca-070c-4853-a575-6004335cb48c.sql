
-- notifications: adicionar campos novos
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS module text,
  ADD COLUMN IF NOT EXISTS related_url text,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS company_id uuid;

-- Sync read_at quando is_read muda
CREATE OR REPLACE FUNCTION public.sync_notification_read_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_read = true AND (OLD.is_read = false OR OLD.is_read IS NULL) AND NEW.read_at IS NULL THEN
    NEW.read_at := now();
  END IF;
  IF NEW.is_read = false THEN
    NEW.read_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_notification_read_at ON public.notifications;
CREATE TRIGGER trg_sync_notification_read_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.sync_notification_read_at();

-- Política para usuários inserirem notificações para si mesmos (necessário p/ teste)
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;
CREATE POLICY "Users can insert own notifications"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Índice de performance para o sino
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, is_read, created_at DESC);

-- user_push_tokens: novos campos
ALTER TABLE public.user_push_tokens
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS device_info jsonb DEFAULT '{}'::jsonb;

-- Grants (idempotente)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_push_tokens TO authenticated;
GRANT ALL ON public.user_push_tokens TO service_role;
