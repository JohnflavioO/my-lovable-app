
CREATE TABLE public.quote_recycle_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL,
  target_date DATE NOT NULL,
  target_status TEXT NOT NULL DEFAULT 'pre_venda',
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_qrr_status ON public.quote_recycle_requests(status);
CREATE INDEX idx_qrr_quote ON public.quote_recycle_requests(quote_id);
CREATE INDEX idx_qrr_requested_by ON public.quote_recycle_requests(requested_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_recycle_requests TO authenticated;
GRANT ALL ON public.quote_recycle_requests TO service_role;

ALTER TABLE public.quote_recycle_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Requesters see own, admins/gestores see all"
  ON public.quote_recycle_requests FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR public.is_admin() OR public.is_gestor());

CREATE POLICY "Users create own requests"
  ON public.quote_recycle_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());

CREATE POLICY "Admins/gestores update requests"
  ON public.quote_recycle_requests FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.is_gestor())
  WITH CHECK (public.is_admin() OR public.is_gestor());

CREATE POLICY "Admins/gestores delete requests"
  ON public.quote_recycle_requests FOR DELETE TO authenticated
  USING (public.is_admin() OR public.is_gestor());

CREATE TRIGGER trg_qrr_updated_at
  BEFORE UPDATE ON public.quote_recycle_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notify admins/gestores on new request
CREATE OR REPLACE FUNCTION public.notify_recycle_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target RECORD;
  _requester TEXT;
  _quote_number TEXT;
  _client TEXT;
BEGIN
  SELECT full_name INTO _requester FROM profiles WHERE user_id = NEW.requested_by LIMIT 1;
  _requester := COALESCE(_requester, 'Vendedor');
  SELECT quote_number, COALESCE(client_name,'Cliente') INTO _quote_number, _client FROM quotes WHERE id = NEW.quote_id;

  FOR _target IN
    SELECT DISTINCT ur.user_id FROM user_roles ur WHERE ur.role IN ('admin','gestor')
  LOOP
    INSERT INTO notifications (user_id, title, message, type, related_quote_id)
    VALUES (
      _target.user_id,
      'Solicitação de reciclagem — ' || COALESCE(_quote_number, ''),
      _requester || ' solicitou reciclar o orçamento de ' || _client || ' para ' || to_char(NEW.target_date,'DD/MM/YYYY') || '.',
      'recycle_request',
      NEW.quote_id
    );
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_recycle_request
  AFTER INSERT ON public.quote_recycle_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_recycle_request();

-- On approval: apply changes to the quote and notify requester
CREATE OR REPLACE FUNCTION public.apply_recycle_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _quote_number TEXT;
BEGIN
  IF OLD.status = 'pendente' AND NEW.status IN ('aprovada','rejeitada') THEN
    NEW.reviewed_by := auth.uid();
    NEW.reviewed_at := now();

    SELECT quote_number INTO _quote_number FROM quotes WHERE id = NEW.quote_id;

    IF NEW.status = 'aprovada' THEN
      UPDATE public.quotes
        SET quote_date = NEW.target_date,
            status = NEW.target_status,
            updated_at = now()
      WHERE id = NEW.quote_id;

      INSERT INTO notifications (user_id, title, message, type, related_quote_id)
      VALUES (
        NEW.requested_by,
        'Reciclagem aprovada — ' || COALESCE(_quote_number,''),
        'Sua solicitação de reciclagem foi aprovada para ' || to_char(NEW.target_date,'DD/MM/YYYY') || '.',
        'recycle_request',
        NEW.quote_id
      );
    ELSE
      INSERT INTO notifications (user_id, title, message, type, related_quote_id)
      VALUES (
        NEW.requested_by,
        'Reciclagem rejeitada — ' || COALESCE(_quote_number,''),
        'Sua solicitação de reciclagem foi rejeitada.' || COALESCE(' Motivo: '||NEW.review_notes,''),
        'recycle_request',
        NEW.quote_id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_recycle_request
  BEFORE UPDATE ON public.quote_recycle_requests
  FOR EACH ROW EXECUTE FUNCTION public.apply_recycle_request();
