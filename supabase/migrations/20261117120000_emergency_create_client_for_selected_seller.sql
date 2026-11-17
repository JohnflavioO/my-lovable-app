-- Allow authorized emergency operators to create a client directly in the
-- selected seller's portfolio without changing the operator's own role.
-- The operator remains the audit author; the selected seller owns the portfolio.
CREATE OR REPLACE FUNCTION public.emergency_create_client_for_seller(
  _seller_id uuid,
  _company_name text,
  _name text,
  _phone text,
  _email text DEFAULT NULL,
  _cpf_cnpj text DEFAULT NULL,
  _city text DEFAULT NULL,
  _state text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_operator uuid := auth.uid();
  v_company uuid;
  v_client_id uuid;
BEGIN
  IF v_operator IS NULL OR NOT public.has_emergency_quote_permission(v_operator) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT p.company_id INTO v_company
  FROM public.profiles p
  WHERE p.user_id = v_operator AND p.active = true AND p.deleted_at IS NULL;

  IF v_company IS NULL THEN RAISE EXCEPTION 'company_not_configured'; END IF;
  IF _seller_id IS NULL THEN RAISE EXCEPTION 'seller_required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = _seller_id
      AND p.active = true
      AND p.deleted_at IS NULL
      AND p.company_id = v_company
      AND p.commercial_visible = true
      AND p.role IN ('comercial', 'gestor')
  ) THEN RAISE EXCEPTION 'seller_not_allowed'; END IF;

  IF nullif(btrim(_phone), '') IS NULL THEN RAISE EXCEPTION 'phone_required'; END IF;
  IF nullif(btrim(_company_name), '') IS NULL AND nullif(btrim(_name), '') IS NULL THEN
    RAISE EXCEPTION 'client_name_required';
  END IF;

  INSERT INTO public.clients (
    name, company_name, phone, email, cpf_cnpj, city, state,
    created_by, salesperson_id, assigned_user_id, company_id, pipeline_stage
  ) VALUES (
    coalesce(nullif(btrim(_name), ''), nullif(btrim(_company_name), '')),
    nullif(btrim(_company_name), ''), btrim(_phone), nullif(btrim(_email), ''),
    nullif(btrim(_cpf_cnpj), ''), nullif(btrim(_city), ''), nullif(btrim(_state), ''),
    v_operator, _seller_id, _seller_id, v_company, 'lead'
  ) RETURNING id INTO v_client_id;

  RETURN v_client_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.emergency_create_client_for_seller(uuid,text,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emergency_create_client_for_seller(uuid,text,text,text,text,text,text,text) TO authenticated;
