CREATE OR REPLACE FUNCTION public.notify_recycle_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _target RECORD;
  _requester TEXT;
  _quote_number TEXT;
  _client TEXT;
BEGIN
  -- Only notify approvers when the request is actually pending
  IF NEW.status <> 'pendente' THEN
    RETURN NEW;
  END IF;

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
$function$;