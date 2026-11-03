-- Corrige a identificação do service_role no gatilho de proteção do faturamento.
-- Compatível com o claim legado e com o objeto JSON request.jwt.claims do PostgREST.
CREATE OR REPLACE FUNCTION public.prevent_sent_quote_edits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  request_role text;
BEGIN
  request_role := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    current_user
  );

  IF COALESCE(request_role, '') <> 'service_role'
     AND (
       NEW.billing_sent_at IS DISTINCT FROM OLD.billing_sent_at
       OR NEW.billing_order_number IS DISTINCT FROM OLD.billing_order_number
       OR NEW.billing_send_status IS DISTINCT FROM OLD.billing_send_status
       OR NEW.billing_send_error IS DISTINCT FROM OLD.billing_send_error
     ) THEN
    RAISE EXCEPTION 'Somente a integração de faturamento pode alterar os metadados de envio.'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.billing_sent_at IS NOT NULL THEN
    IF (to_jsonb(NEW) - ARRAY['billing_sent_at','billing_order_number','billing_send_status','billing_send_error'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['billing_sent_at','billing_order_number','billing_send_status','billing_send_error']) THEN
      RAISE EXCEPTION 'Este orçamento foi enviado ao faturamento e está bloqueado para edição. Solicite a edição ao setor de faturamento.'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
