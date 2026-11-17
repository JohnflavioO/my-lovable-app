-- Align emergency client creation with the full global CRM client form.
DROP FUNCTION IF EXISTS public.emergency_create_client_for_seller(uuid,text,text,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.emergency_create_own_client(text,text,text,text,text,text,text);

CREATE OR REPLACE FUNCTION public.emergency_create_client_for_seller(
  _seller_id uuid, _company_name text, _name text, _phone text,
  _email text DEFAULT NULL, _cpf_cnpj text DEFAULT NULL, _city text DEFAULT NULL, _state text DEFAULT NULL,
  _address text DEFAULT NULL, _address_number text DEFAULT NULL, _complement text DEFAULT NULL,
  _neighborhood text DEFAULT NULL, _cep text DEFAULT NULL, _contact_name text DEFAULT NULL,
  _contact_phone text DEFAULT NULL, _contrib_icms text DEFAULT NULL, _notes text DEFAULT NULL,
  _client_type text DEFAULT NULL, _is_whatsapp boolean DEFAULT false, _is_revenda boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_operator uuid := auth.uid(); v_company uuid; v_client_id uuid;
BEGIN
  IF v_operator IS NULL OR NOT public.has_emergency_quote_permission(v_operator) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT p.company_id INTO v_company FROM public.profiles p WHERE p.user_id=v_operator AND p.active=true AND p.deleted_at IS NULL;
  IF v_company IS NULL THEN RAISE EXCEPTION 'company_not_configured'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=_seller_id AND p.active=true AND p.deleted_at IS NULL AND p.company_id=v_company AND p.commercial_visible=true AND p.role IN ('comercial','gestor')) THEN RAISE EXCEPTION 'seller_not_allowed'; END IF;
  IF nullif(btrim(_phone),'') IS NULL OR length(btrim(_phone))<8 THEN RAISE EXCEPTION 'phone_required'; END IF;
  IF nullif(btrim(_email),'') IS NULL OR position('@' in _email)=0 THEN RAISE EXCEPTION 'valid_email_required'; END IF;
  IF nullif(btrim(_company_name),'') IS NULL AND nullif(btrim(_name),'') IS NULL THEN RAISE EXCEPTION 'client_name_required'; END IF;
  IF coalesce(_is_revenda,false) AND nullif(btrim(_contrib_icms),'') IS NULL THEN RAISE EXCEPTION 'state_registration_required'; END IF;
  INSERT INTO public.clients (name,company_name,phone,email,cpf_cnpj,city,state,address,address_number,complement,neighborhood,cep,contact_name,contact_phone,contrib_icms,notes,client_type,is_whatsapp,is_revenda,created_by,salesperson_id,assigned_user_id,company_id,pipeline_stage,source)
  VALUES (coalesce(nullif(btrim(_name),''),nullif(btrim(_company_name),'')),nullif(btrim(_company_name),''),btrim(_phone),nullif(btrim(_email),''),nullif(btrim(_cpf_cnpj),''),nullif(btrim(_city),''),nullif(btrim(_state),''),nullif(btrim(_address),''),nullif(btrim(_address_number),''),nullif(btrim(_complement),''),nullif(btrim(_neighborhood),''),nullif(btrim(_cep),''),nullif(btrim(_contact_name),''),nullif(btrim(_contact_phone),''),nullif(btrim(_contrib_icms),''),nullif(btrim(_notes),''),nullif(btrim(_client_type),''),coalesce(_is_whatsapp,false),coalesce(_is_revenda,false),v_operator,_seller_id,_seller_id,v_company,'lead','crm_manual')
  RETURNING id INTO v_client_id;
  RETURN v_client_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.emergency_create_own_client(
  _company_name text, _name text, _phone text, _email text DEFAULT NULL,
  _cpf_cnpj text DEFAULT NULL, _city text DEFAULT NULL, _state text DEFAULT NULL,
  _address text DEFAULT NULL, _address_number text DEFAULT NULL, _complement text DEFAULT NULL,
  _neighborhood text DEFAULT NULL, _cep text DEFAULT NULL, _contact_name text DEFAULT NULL,
  _contact_phone text DEFAULT NULL, _contrib_icms text DEFAULT NULL, _notes text DEFAULT NULL,
  _client_type text DEFAULT NULL, _is_whatsapp boolean DEFAULT false, _is_revenda boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_operator uuid := auth.uid(); v_company uuid; v_client_id uuid;
BEGIN
  IF v_operator IS NULL OR NOT public.has_emergency_quote_permission(v_operator) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT p.company_id INTO v_company FROM public.profiles p WHERE p.user_id=v_operator AND p.active=true AND p.deleted_at IS NULL;
  IF v_company IS NULL THEN RAISE EXCEPTION 'company_not_configured'; END IF;
  IF nullif(btrim(_phone),'') IS NULL OR length(btrim(_phone))<8 THEN RAISE EXCEPTION 'phone_required'; END IF;
  IF nullif(btrim(_email),'') IS NULL OR position('@' in _email)=0 THEN RAISE EXCEPTION 'valid_email_required'; END IF;
  IF nullif(btrim(_company_name),'') IS NULL AND nullif(btrim(_name),'') IS NULL THEN RAISE EXCEPTION 'client_name_required'; END IF;
  IF coalesce(_is_revenda,false) AND nullif(btrim(_contrib_icms),'') IS NULL THEN RAISE EXCEPTION 'state_registration_required'; END IF;
  INSERT INTO public.clients (name,company_name,phone,email,cpf_cnpj,city,state,address,address_number,complement,neighborhood,cep,contact_name,contact_phone,contrib_icms,notes,client_type,is_whatsapp,is_revenda,created_by,salesperson_id,assigned_user_id,company_id,pipeline_stage,source)
  VALUES (coalesce(nullif(btrim(_name),''),nullif(btrim(_company_name),'')),nullif(btrim(_company_name),''),btrim(_phone),nullif(btrim(_email),''),nullif(btrim(_cpf_cnpj),''),nullif(btrim(_city),''),nullif(btrim(_state),''),nullif(btrim(_address),''),nullif(btrim(_address_number),''),nullif(btrim(_complement),''),nullif(btrim(_neighborhood),''),nullif(btrim(_cep),''),nullif(btrim(_contact_name),''),nullif(btrim(_contact_phone),''),nullif(btrim(_contrib_icms),''),nullif(btrim(_notes),''),nullif(btrim(_client_type),''),coalesce(_is_whatsapp,false),coalesce(_is_revenda,false),v_operator,v_operator,v_operator,v_company,'lead','crm_manual')
  RETURNING id INTO v_client_id;
  RETURN v_client_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.emergency_create_client_for_seller(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emergency_create_client_for_seller(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.emergency_create_own_client(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emergency_create_own_client(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean) TO authenticated;
