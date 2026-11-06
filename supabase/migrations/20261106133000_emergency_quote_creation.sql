-- Emergency quote issuance: secure, atomic creation and client ownership validation.
CREATE OR REPLACE FUNCTION public.validate_quote_client_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_company uuid;
BEGIN
  IF NEW.client_id IS NULL THEN RETURN NEW; END IF;
  IF auth.role() = 'service_role' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.client_id IS NOT DISTINCT FROM OLD.client_id THEN RETURN NEW; END IF;
  IF COALESCE(NEW.is_transitional,false) AND public.has_emergency_quote_permission(auth.uid()) THEN
    SELECT p.company_id INTO v_company FROM public.profiles p
    WHERE p.user_id=auth.uid() AND p.active=true AND p.deleted_at IS NULL;
    IF EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id=NEW.client_id
        AND (c.company_id=v_company OR (c.company_id IS NULL AND EXISTS (
          SELECT 1 FROM public.quotes q WHERE q.client_id=c.id AND q.company_id=v_company
            AND q.salesperson_id=NEW.emergency_for_user_id
        )))
        AND (
          (NEW.emergency_mode='own' AND NEW.emergency_for_user_id=auth.uid()
            AND (c.created_by=auth.uid() OR c.salesperson_id=auth.uid() OR c.assigned_user_id=auth.uid()
              OR EXISTS (SELECT 1 FROM public.quotes q WHERE q.client_id=c.id AND q.company_id=v_company
                AND (q.salesperson_id=auth.uid() OR q.created_by=auth.uid()))))
          OR
          (NEW.emergency_mode='on_behalf' AND EXISTS (
            SELECT 1 FROM public.profiles p WHERE p.user_id=NEW.emergency_for_user_id
              AND p.active=true AND p.deleted_at IS NULL AND p.company_id=v_company
              AND p.commercial_visible=true AND p.role IN ('comercial','gestor')
          ) AND (c.created_by=NEW.emergency_for_user_id OR c.salesperson_id=NEW.emergency_for_user_id
            OR c.assigned_user_id=NEW.emergency_for_user_id
            OR EXISTS (SELECT 1 FROM public.quotes q WHERE q.client_id=c.id AND q.company_id=v_company
              AND q.salesperson_id=NEW.emergency_for_user_id)))
        )
    ) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'emergency_client_not_in_selected_wallet';
  END IF;
  IF auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.clients c WHERE c.id=NEW.client_id AND (
      c.created_by=auth.uid() OR public.is_admin()
      OR (public.is_gestor() AND c.company_id IS NOT NULL
        AND c.company_id=public.current_user_company_id()
        AND NEW.company_id=public.current_user_company_id())
    )
  ) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Você só pode vincular orçamentos aos seus próprios clientes';
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_emergency_quote(
  _seller_id uuid, _client_id uuid, _mode text, _reason text, _items jsonb
)
RETURNS TABLE(quote_id uuid, quote_number text, total_amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_operator uuid := auth.uid();
  v_company uuid;
  v_seller_name text;
  v_client record;
  v_quote_id uuid;
  v_quote_number text;
  v_total numeric := 0;
  v_item jsonb;
  v_product record;
  v_qty integer;
  v_line numeric;
  v_idx integer := 0;
BEGIN
  IF v_operator IS NULL OR NOT public.has_emergency_quote_permission(v_operator) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF _mode NOT IN ('own','on_behalf') OR _seller_id IS NULL OR _client_id IS NULL THEN RAISE EXCEPTION 'invalid_emergency_context'; END IF;
  IF (_mode='own' AND _seller_id<>v_operator) OR (_mode='on_behalf' AND _seller_id=v_operator) THEN RAISE EXCEPTION 'invalid_emergency_context'; END IF;
  SELECT p.company_id INTO v_company FROM public.profiles p WHERE p.user_id=v_operator AND p.active=true AND p.deleted_at IS NULL;
  IF v_company IS NULL THEN RAISE EXCEPTION 'company_not_configured'; END IF;
  IF _mode='on_behalf' AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id=_seller_id AND p.active=true AND p.deleted_at IS NULL
      AND p.company_id=v_company AND p.commercial_visible=true AND p.role IN ('comercial','gestor')
  ) THEN RAISE EXCEPTION 'seller_not_allowed'; END IF;
  SELECT p.full_name INTO v_seller_name FROM public.profiles p WHERE p.user_id=_seller_id;
  SELECT c.* INTO v_client FROM public.clients c
  WHERE c.id=_client_id
    AND (c.company_id=v_company OR (c.company_id IS NULL AND EXISTS (
      SELECT 1 FROM public.quotes q WHERE q.client_id=c.id AND q.company_id=v_company AND q.salesperson_id=_seller_id
    )))
    AND (
      (_mode='own' AND _seller_id=v_operator AND (c.created_by=v_operator OR c.salesperson_id=v_operator
        OR c.assigned_user_id=v_operator OR EXISTS (SELECT 1 FROM public.quotes q WHERE q.client_id=c.id
          AND q.company_id=v_company AND (q.salesperson_id=v_operator OR q.created_by=v_operator))))
      OR
      (_mode='on_behalf' AND (c.created_by=_seller_id OR c.salesperson_id=_seller_id OR c.assigned_user_id=_seller_id
        OR EXISTS (SELECT 1 FROM public.quotes q WHERE q.client_id=c.id AND q.company_id=v_company AND q.salesperson_id=_seller_id)))
    );
  IF NOT FOUND THEN RAISE EXCEPTION 'emergency_client_not_in_selected_wallet'; END IF;
  IF coalesce(jsonb_typeof(_items),'') <> 'array' OR jsonb_array_length(coalesce(_items,'[]'::jsonb))=0 THEN
    RAISE EXCEPTION 'at_least_one_product_required';
  END IF;
  IF length(trim(coalesce(_reason,''))) < 5 THEN RAISE EXCEPTION 'emergency_reason_required'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    v_qty := coalesce((v_item->>'quantity')::integer,0);
    IF v_qty < 1 OR v_qty > 999 THEN RAISE EXCEPTION 'invalid_product_quantity'; END IF;
    SELECT p.id,p.name,p.brand,p.description,p.code,p.sku,p.price,p.image_url,p.category_principal INTO v_product
    FROM public.products p WHERE p.id=(v_item->>'product_id')::uuid AND (p.company_id IS NULL OR p.company_id=v_company);
    IF NOT FOUND THEN RAISE EXCEPTION 'product_not_available'; END IF;
    IF coalesce(v_product.price,0) < 0 THEN RAISE EXCEPTION 'invalid_product_price'; END IF;
    v_total := v_total + round(coalesce(v_product.price,0)*v_qty,2);
  END LOOP;
  v_quote_number := public.generate_quote_number();
  INSERT INTO public.quotes(
    quote_number,client_id,client_name,salesperson,salesperson_id,status,quote_date,total,total_amount,
    discount,notes,created_by,company_id,payment_status,is_reseller,is_transitional,emergency_operator_id,
    emergency_for_user_id,emergency_mode,regularization_status,emergency_reason,billing_send_status
  ) VALUES (
    v_quote_number,_client_id,coalesce(nullif(v_client.company_name,''),v_client.name),
    coalesce(v_seller_name,'Atendimento emergencial'),_seller_id,'draft',current_date,v_total,v_total,0,
    'EMISSÃO EMERGENCIAL - '||trim(_reason),v_operator,v_company,'pendente',coalesce(v_client.is_revenda,false),
    true,v_operator,_seller_id,_mode,'pending',trim(_reason),'pending'
  ) RETURNING id INTO v_quote_id;
  v_idx := 0;
  FOR v_item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    v_idx := v_idx + 1;
    v_qty := (v_item->>'quantity')::integer;
    SELECT p.name,p.brand,p.description,p.code,p.sku,p.price,p.image_url,p.category_principal INTO v_product
    FROM public.products p WHERE p.id=(v_item->>'product_id')::uuid AND (p.company_id IS NULL OR p.company_id=v_company);
    v_line := round(coalesce(v_product.price,0)*v_qty,2);
    INSERT INTO public.quote_items(
      quote_id,item_number,code,description,quantity,unit_price,total_price,category,model,brand,specifications,
      discount_percent,unit_total,line_total,product_code,image_url,is_gift,description_layout,transfer_status,is_presale
    ) VALUES (
      v_quote_id,v_idx,coalesce(v_product.code,v_product.sku),v_product.description,v_qty,v_product.price,v_line,
      v_product.category_principal,v_product.name,v_product.brand,v_product.description,0,v_product.price,v_line,
      coalesce(v_product.code,v_product.sku),v_product.image_url,false,'compact',null,false
    );
  END LOOP;
  RETURN QUERY SELECT v_quote_id,v_quote_number,v_total;
END;
$function$;
REVOKE ALL ON FUNCTION public.create_emergency_quote(uuid,uuid,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_emergency_quote(uuid,uuid,text,text,jsonb) TO authenticated;
