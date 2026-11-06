-- Applied to the MCI CRM Supabase project before being versioned here.
-- Restrict "Minha carteira" to clients actually created by the emergency operator.
CREATE OR REPLACE FUNCTION public.emergency_quote_clients(_seller_id uuid)
RETURNS TABLE(id uuid, name text, company_name text, phone text, email text, cpf_cnpj text, city text, state text, cep text, address text, is_revenda boolean, contrib_icms text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_company uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_emergency_quote_permission(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT p.company_id INTO v_company FROM public.profiles p
  WHERE p.user_id=auth.uid() AND p.active=true AND p.deleted_at IS NULL;
  IF v_company IS NULL THEN RAISE EXCEPTION 'company_not_configured'; END IF;
  IF _seller_id IS NULL THEN RAISE EXCEPTION 'seller_required'; END IF;
  IF _seller_id<>auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id=_seller_id AND p.active=true AND p.deleted_at IS NULL
      AND p.company_id=v_company AND p.commercial_visible=true
      AND p.role IN ('comercial','gestor')
  ) THEN RAISE EXCEPTION 'seller_not_allowed'; END IF;

  RETURN QUERY
  SELECT DISTINCT c.id,c.name::text,c.company_name::text,c.phone::text,c.email::text,
    c.cpf_cnpj::text,c.city::text,c.state::text,c.cep::text,c.address::text,
    c.is_revenda,c.contrib_icms::text
  FROM public.clients c
  WHERE (
    c.company_id=v_company
    OR (
      c.company_id IS NULL AND EXISTS (
        SELECT 1 FROM public.quotes q
        WHERE q.client_id=c.id AND q.company_id=v_company
          AND ((_seller_id=auth.uid() AND q.created_by=auth.uid())
            OR (_seller_id<>auth.uid() AND q.salesperson_id=_seller_id))
      )
    )
  )
  AND (
    (_seller_id=auth.uid() AND c.created_by=auth.uid())
    OR
    (_seller_id<>auth.uid() AND (
      c.created_by=_seller_id OR c.salesperson_id=_seller_id OR c.assigned_user_id=_seller_id
      OR EXISTS (SELECT 1 FROM public.quotes q WHERE q.client_id=c.id AND q.company_id=v_company AND q.salesperson_id=_seller_id)
    ))
  )
  ORDER BY 3, 2;
END;
$function$;

-- Create a client in the operator's own portfolio only. The caller cannot choose
-- created_by, salesperson_id, assigned_user_id or company_id.
CREATE OR REPLACE FUNCTION public.emergency_create_own_client(
  _company_name text,
  _name text,
  _phone text,
  _email text DEFAULT NULL,
  _cpf_cnpj text DEFAULT NULL,
  _city text DEFAULT NULL,
  _state text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_company uuid; v_client_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_emergency_quote_permission(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT p.company_id INTO v_company FROM public.profiles p
  WHERE p.user_id=auth.uid() AND p.active=true AND p.deleted_at IS NULL;
  IF v_company IS NULL THEN RAISE EXCEPTION 'company_not_configured'; END IF;
  IF nullif(btrim(_phone),'') IS NULL THEN RAISE EXCEPTION 'phone_required'; END IF;
  IF nullif(btrim(_company_name),'') IS NULL AND nullif(btrim(_name),'') IS NULL THEN RAISE EXCEPTION 'client_name_required'; END IF;

  INSERT INTO public.clients (
    name, company_name, phone, email, cpf_cnpj, city, state,
    created_by, salesperson_id, assigned_user_id, company_id, pipeline_stage
  ) VALUES (
    coalesce(nullif(btrim(_name),''), nullif(btrim(_company_name),'')),
    nullif(btrim(_company_name),''), btrim(_phone), nullif(btrim(_email),''),
    nullif(btrim(_cpf_cnpj),''), nullif(btrim(_city),''), nullif(btrim(_state),''),
    auth.uid(), auth.uid(), auth.uid(), v_company, 'lead'
  ) RETURNING id INTO v_client_id;
  RETURN v_client_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.emergency_create_own_client(text,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emergency_create_own_client(text,text,text,text,text,text,text) TO authenticated;
