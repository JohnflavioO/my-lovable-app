-- Align client-link validation with existing manager/admin access policies.
-- Public quote policies and ownership of quotes/clients are not changed.
CREATE OR REPLACE FUNCTION public.validate_quote_client_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.client_id IS NOT DISTINCT FROM OLD.client_id THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = NEW.client_id
      AND (
        c.created_by = auth.uid()
        OR public.is_admin()
        OR (
          public.is_gestor()
          AND c.company_id IS NOT NULL
          AND c.company_id = public.current_user_company_id()
          AND NEW.company_id = public.current_user_company_id()
        )
      )
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Você só pode vincular orçamentos aos seus próprios clientes';
END;
$$;