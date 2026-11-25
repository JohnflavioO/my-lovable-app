-- Não repetir cliente (mesmo CPF/CNPJ) na MESMA carteira.
-- O mesmo documento na carteira de outro vendedor continua permitido.
-- Cadastros repetidos já existentes NÃO são alterados.

-- 1) CPF/CNPJ só com dígitos (gravados hoje com e sem pontuação) + índice.
CREATE OR REPLACE FUNCTION public.client_doc_digits(_doc text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT nullif(regexp_replace(coalesce(_doc, ''), '\D', '', 'g'), '') $$;

CREATE INDEX IF NOT EXISTS idx_clients_doc_digits
  ON public.clients (public.client_doc_digits(cpf_cnpj));

-- 2) Cadastro existente com o mesmo documento na carteira de _owner.
--    Carteira = criado por, vendedor responsável ou atribuído a _owner
--    (mesma definição usada pela emissão emergencial).
CREATE OR REPLACE FUNCTION public.find_client_in_portfolio(_owner uuid, _doc text)
RETURNS TABLE (id uuid, company_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id, coalesce(c.company_name, c.name)::text
    FROM public.clients c
   WHERE length(coalesce(public.client_doc_digits(_doc), '')) >= 11
     AND public.client_doc_digits(c.cpf_cnpj) = public.client_doc_digits(_doc)
     AND (c.created_by = _owner OR c.salesperson_id = _owner OR c.assigned_user_id = _owner)
   ORDER BY c.created_at
   LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.find_client_in_portfolio(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_client_in_portfolio(uuid, text) TO service_role;

-- 3) Landing de revenda: busca por documento ignorando pontuação
--    (antes comparava o texto exato e não achava CNPJ gravado com pontos).
CREATE OR REPLACE FUNCTION public.find_client_by_document(_doc text)
RETURNS TABLE (id uuid, salesperson_id uuid, assigned_user_id uuid, created_by uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id, c.salesperson_id, c.assigned_user_id, c.created_by
    FROM public.clients c
   WHERE length(coalesce(public.client_doc_digits(_doc), '')) >= 11
     AND public.client_doc_digits(c.cpf_cnpj) = public.client_doc_digits(_doc)
   ORDER BY c.created_at
   LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.find_client_by_document(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_client_by_document(text) TO service_role;

-- 4) Emissão emergencial — cadastro na carteira do vendedor selecionado.
CREATE OR REPLACE FUNCTION public.emergency_create_client_for_seller(
  _seller_id uuid, _company_name text, _name text, _phone text, _email text DEFAULT NULL::text,
  _cpf_cnpj text DEFAULT NULL::text, _city text DEFAULT NULL::text, _state text DEFAULT NULL::text,
  _address text DEFAULT NULL::text, _address_number text DEFAULT NULL::text, _complement text DEFAULT NULL::text,
  _neighborhood text DEFAULT NULL::text, _cep text DEFAULT NULL::text, _contact_name text DEFAULT NULL::text,
  _contact_phone text DEFAULT NULL::text, _contrib_icms text DEFAULT NULL::text, _notes text DEFAULT NULL::text,
  _client_type text DEFAULT NULL::text, _is_whatsapp boolean DEFAULT false, _is_revenda boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_operator uuid := auth.uid(); v_company uuid; v_client_id uuid; v_existing text;
BEGIN
  IF v_operator IS NULL OR NOT public.has_emergency_quote_permission(v_operator) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT p.company_id INTO v_company FROM public.profiles p
  WHERE p.user_id=v_operator AND p.active=true AND p.deleted_at IS NULL;
  IF v_company IS NULL THEN RAISE EXCEPTION 'company_not_configured'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=_seller_id AND p.active=true
    AND p.deleted_at IS NULL AND p.company_id=v_company AND p.commercial_visible=true
    AND p.role IN ('comercial','gestor')) THEN RAISE EXCEPTION 'seller_not_allowed'; END IF;
  IF nullif(btrim(_phone),'') IS NULL OR length(btrim(_phone))<8 THEN RAISE EXCEPTION 'phone_required'; END IF;
  IF nullif(btrim(_email),'') IS NULL OR position('@' in _email)=0 THEN RAISE EXCEPTION 'valid_email_required'; END IF;
  IF nullif(btrim(_company_name),'') IS NULL AND nullif(btrim(_name),'') IS NULL THEN RAISE EXCEPTION 'client_name_required'; END IF;
  IF coalesce(_is_revenda,false) AND nullif(btrim(_contrib_icms),'') IS NULL THEN RAISE EXCEPTION 'state_registration_required'; END IF;
  SELECT f.company_name INTO v_existing FROM public.find_client_in_portfolio(_seller_id, _cpf_cnpj) f;
  IF FOUND THEN
    RAISE EXCEPTION 'Este CPF/CNPJ já está na carteira deste vendedor (%). Selecione o cliente existente.', coalesce(v_existing, 'sem nome')
      USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.clients (
    name,company_name,phone,email,cpf_cnpj,city,state,address,address_number,complement,neighborhood,cep,
    contact_name,contact_phone,contrib_icms,notes,client_type,is_whatsapp,is_revenda,
    created_by,salesperson_id,assigned_user_id,company_id,pipeline_stage,source
  ) VALUES (
    coalesce(nullif(btrim(_name),''),nullif(btrim(_company_name),'')),nullif(btrim(_company_name),''),btrim(_phone),
    nullif(btrim(_email),''),nullif(btrim(_cpf_cnpj),''),nullif(btrim(_city),''),nullif(btrim(_state),''),
    nullif(btrim(_address),''),nullif(btrim(_address_number),''),nullif(btrim(_complement),''),
    nullif(btrim(_neighborhood),''),nullif(btrim(_cep),''),nullif(btrim(_contact_name),''),
    nullif(btrim(_contact_phone),''),nullif(btrim(_contrib_icms),''),nullif(btrim(_notes),''),
    nullif(btrim(_client_type),''),coalesce(_is_whatsapp,false),coalesce(_is_revenda,false),
    v_operator,_seller_id,_seller_id,v_company,'lead','crm_manual'
  ) RETURNING id INTO v_client_id;
  RETURN v_client_id;
END;
$$;

-- 5) Emissão emergencial — cadastro na própria carteira.
CREATE OR REPLACE FUNCTION public.emergency_create_own_client(
  _company_name text, _name text, _phone text, _email text DEFAULT NULL::text,
  _cpf_cnpj text DEFAULT NULL::text, _city text DEFAULT NULL::text, _state text DEFAULT NULL::text,
  _address text DEFAULT NULL::text, _address_number text DEFAULT NULL::text, _complement text DEFAULT NULL::text,
  _neighborhood text DEFAULT NULL::text, _cep text DEFAULT NULL::text, _contact_name text DEFAULT NULL::text,
  _contact_phone text DEFAULT NULL::text, _contrib_icms text DEFAULT NULL::text, _notes text DEFAULT NULL::text,
  _client_type text DEFAULT NULL::text, _is_whatsapp boolean DEFAULT false, _is_revenda boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_operator uuid := auth.uid(); v_company uuid; v_client_id uuid; v_existing text;
BEGIN
  IF v_operator IS NULL OR NOT public.has_emergency_quote_permission(v_operator) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT p.company_id INTO v_company FROM public.profiles p
  WHERE p.user_id=v_operator AND p.active=true AND p.deleted_at IS NULL;
  IF v_company IS NULL THEN RAISE EXCEPTION 'company_not_configured'; END IF;
  IF nullif(btrim(_phone),'') IS NULL OR length(btrim(_phone))<8 THEN RAISE EXCEPTION 'phone_required'; END IF;
  IF nullif(btrim(_email),'') IS NULL OR position('@' in _email)=0 THEN RAISE EXCEPTION 'valid_email_required'; END IF;
  IF nullif(btrim(_company_name),'') IS NULL AND nullif(btrim(_name),'') IS NULL THEN RAISE EXCEPTION 'client_name_required'; END IF;
  IF coalesce(_is_revenda,false) AND nullif(btrim(_contrib_icms),'') IS NULL THEN RAISE EXCEPTION 'state_registration_required'; END IF;
  SELECT f.company_name INTO v_existing FROM public.find_client_in_portfolio(v_operator, _cpf_cnpj) f;
  IF FOUND THEN
    RAISE EXCEPTION 'Este CPF/CNPJ já está na sua carteira (%). Selecione o cliente existente.', coalesce(v_existing, 'sem nome')
      USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.clients (
    name,company_name,phone,email,cpf_cnpj,city,state,address,address_number,complement,neighborhood,cep,
    contact_name,contact_phone,contrib_icms,notes,client_type,is_whatsapp,is_revenda,
    created_by,salesperson_id,assigned_user_id,company_id,pipeline_stage,source
  ) VALUES (
    coalesce(nullif(btrim(_name),''),nullif(btrim(_company_name),'')),nullif(btrim(_company_name),''),
    btrim(_phone),nullif(btrim(_email),''),nullif(btrim(_cpf_cnpj),''),nullif(btrim(_city),''),
    nullif(btrim(_state),''),nullif(btrim(_address),''),nullif(btrim(_address_number),''),
    nullif(btrim(_complement),''),nullif(btrim(_neighborhood),''),nullif(btrim(_cep),''),
    nullif(btrim(_contact_name),''),nullif(btrim(_contact_phone),''),nullif(btrim(_contrib_icms),''),
    nullif(btrim(_notes),''),nullif(btrim(_client_type),''),coalesce(_is_whatsapp,false),
    coalesce(_is_revenda,false),v_operator,v_operator,v_operator,v_company,'lead','crm_manual'
  ) RETURNING id INTO v_client_id;
  RETURN v_client_id;
END;
$$;

-- Permissões iguais às de antes (CREATE OR REPLACE preserva; reforçado aqui).
REVOKE ALL ON FUNCTION public.emergency_create_client_for_seller(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.emergency_create_own_client(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emergency_create_client_for_seller(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.emergency_create_own_client(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean) TO authenticated, service_role;
