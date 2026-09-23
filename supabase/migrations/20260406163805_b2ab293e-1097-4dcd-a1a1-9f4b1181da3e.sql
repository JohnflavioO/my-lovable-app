
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
    WHEN 'negociacao' THEN 'Negociação'
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
      _seller_name || ' alterou o orçamento de ' || _client || ' para ' || _status_label || '.',
      'quote_status',
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$;
