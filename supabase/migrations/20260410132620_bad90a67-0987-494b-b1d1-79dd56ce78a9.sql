
CREATE OR REPLACE FUNCTION public.remove_logistics_on_unapproval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _target RECORD;
  _seller_name TEXT;
  _client TEXT;
BEGIN
  IF (TG_OP = 'UPDATE'
      AND OLD.status = 'approved'
      AND NEW.status IS DISTINCT FROM 'approved')
  THEN
    -- Get seller name and client for notification
    SELECT full_name INTO _seller_name FROM profiles WHERE user_id = NEW.created_by LIMIT 1;
    _seller_name := COALESCE(_seller_name, 'Vendedor');
    _client := COALESCE(NULLIF(NEW.client_name, ''), 'Cliente');

    -- Notify all logistics users
    FOR _target IN
      SELECT ur.user_id FROM user_roles ur WHERE ur.role = 'logistica'
    LOOP
      INSERT INTO notifications (user_id, title, message, type, related_quote_id)
      VALUES (
        _target.user_id,
        'Pedido removido — ' || NEW.quote_number,
        _seller_name || ' alterou o orçamento de ' || _client || ' para outro status. O pedido foi removido da logística.',
        'quote_status',
        NEW.id
      );
    END LOOP;

    -- Delete logistics records
    DELETE FROM public.logistics_action_history
    WHERE logistics_record_id IN (
      SELECT id FROM public.logistics_records WHERE quote_id = NEW.id
    );
    DELETE FROM public.logistics_records WHERE quote_id = NEW.id;

    -- Delete financial records
    DELETE FROM public.financial_action_history
    WHERE financial_record_id IN (
      SELECT id FROM public.financial_records WHERE quote_id = NEW.id
    );
    DELETE FROM public.financial_records WHERE quote_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
