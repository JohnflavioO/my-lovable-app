
-- Notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT false,
  related_quote_id UUID REFERENCES public.quotes(id) ON DELETE CASCADE,
  related_client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
ON public.notifications FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own notifications"
ON public.notifications FOR DELETE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "System can insert notifications"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE INDEX idx_notifications_user_read ON public.notifications(user_id, is_read);
CREATE INDEX idx_notifications_created ON public.notifications(created_at DESC);

-- Function to notify gestors/admins on quote status change
CREATE OR REPLACE FUNCTION public.notify_on_quote_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target RECORD;
  _seller_name TEXT;
  _client TEXT;
  _status_label TEXT;
BEGIN
  -- Only fire on status change or new non-draft quote
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO _seller_name FROM profiles WHERE user_id = NEW.created_by LIMIT 1;
  _seller_name := COALESCE(_seller_name, 'Vendedor');
  _client := COALESCE(NEW.client_name, '');

  _status_label := CASE NEW.status
    WHEN 'draft' THEN 'Rascunho'
    WHEN 'pre_sale' THEN 'Pré-venda'
    WHEN 'contact_made' THEN 'Contato Feito'
    WHEN 'sent' THEN 'Proposta Enviada'
    WHEN 'negotiation' THEN 'Negociação'
    WHEN 'approved' THEN 'Aprovado'
    WHEN 'rejected' THEN 'Rejeitado'
    ELSE NEW.status
  END;

  FOR _target IN
    SELECT ur.user_id FROM user_roles ur
    WHERE ur.role IN ('admin', 'gestor')
      AND ur.user_id != NEW.created_by
  LOOP
    INSERT INTO notifications (user_id, title, message, type, related_quote_id)
    VALUES (
      _target.user_id,
      'Orçamento ' || NEW.quote_number || ' — ' || _status_label,
      _seller_name || ' alterou o orçamento para ' || _client || ' para ' || _status_label || '.',
      'quote_status',
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_quote_change
AFTER INSERT OR UPDATE OF status ON public.quotes
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_quote_change();

-- Notify on new client creation
CREATE OR REPLACE FUNCTION public.notify_on_new_client()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target RECORD;
  _seller_name TEXT;
BEGIN
  SELECT full_name INTO _seller_name FROM profiles WHERE user_id = NEW.created_by LIMIT 1;
  _seller_name := COALESCE(_seller_name, 'Vendedor');

  FOR _target IN
    SELECT ur.user_id FROM user_roles ur
    WHERE ur.role IN ('admin', 'gestor')
      AND ur.user_id != NEW.created_by
  LOOP
    INSERT INTO notifications (user_id, title, message, type, related_client_id)
    VALUES (
      _target.user_id,
      'Novo cliente cadastrado',
      _seller_name || ' cadastrou o cliente ' || COALESCE(NEW.company_name, NEW.name) || '.',
      'new_client',
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_client
AFTER INSERT ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_new_client();
