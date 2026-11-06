CREATE OR REPLACE FUNCTION public.create_emergency_quote_full(
  _seller_id uuid,
  _client_id uuid,
  _mode text,
  _reason text,
  _quote_data jsonb,
  _items jsonb
)
RETURNS TABLE(quote_id uuid, quote_number text, total_amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_operator uuid := auth.uid();
  v_company uuid;
  v_seller_name text;
  v_client public.clients%ROWTYPE;
  v_quote_id uuid;
  v_quote_number text;
  v_total numeric;
  v_item record;
  v_idx integer := 0;
BEGIN
  IF v_operator IS NULL OR NOT public.has_emergency_quote_permission(v_operator) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF _mode NOT IN ('own','on_behalf') OR _seller_id IS NULL OR _client_id IS NULL
     OR (_mode='own' AND _seller_id<>v_operator)
     OR (_mode='on_behalf' AND _seller_id=v_operator) THEN
    RAISE EXCEPTION 'invalid_emergency_context';
  END IF;
  SELECT p.company_id INTO v_company FROM public.profiles p
  WHERE p.user_id=v_operator AND p.active=true AND p.deleted_at IS NULL;
  IF v_company IS NULL THEN RAISE EXCEPTION 'company_not_configured'; END IF;
  IF _mode='on_behalf' AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id=_seller_id AND p.active=true
      AND p.deleted_at IS NULL AND p.company_id=v_company
      AND p.commercial_visible=true AND p.role IN ('comercial','gestor','admin','vendedor')
  ) THEN RAISE EXCEPTION 'seller_not_allowed'; END IF;
  SELECT c.* INTO v_client FROM public.clients c
  WHERE c.id=_client_id AND (c.company_id=v_company OR
    (c.company_id IS NULL AND EXISTS (SELECT 1 FROM public.quotes q
      WHERE q.client_id=c.id AND q.company_id=v_company AND q.salesperson_id=_seller_id)))
    AND (
      (_mode='own' AND _seller_id=v_operator AND
        (c.created_by=v_operator OR c.salesperson_id=v_operator OR c.assigned_user_id=v_operator
         OR EXISTS (SELECT 1 FROM public.quotes q WHERE q.client_id=c.id AND q.company_id=v_company
           AND (q.salesperson_id=v_operator OR q.created_by=v_operator))))
      OR
      (_mode='on_behalf' AND
        (c.created_by=_seller_id OR c.salesperson_id=_seller_id OR c.assigned_user_id=_seller_id
         OR EXISTS (SELECT 1 FROM public.quotes q WHERE q.client_id=c.id AND q.company_id=v_company
           AND q.salesperson_id=_seller_id)))
    );
  IF NOT FOUND THEN RAISE EXCEPTION 'emergency_client_not_in_selected_wallet'; END IF;
  IF length(trim(coalesce(_reason,''))) < 5 THEN RAISE EXCEPTION 'emergency_reason_required'; END IF;
  IF coalesce(jsonb_typeof(_items),'') <> 'array' OR jsonb_array_length(coalesce(_items,'[]'::jsonb))=0 THEN
    RAISE EXCEPTION 'at_least_one_product_required';
  END IF;

  v_total := coalesce(nullif(_quote_data->>'total_amount','')::numeric,0);
  IF v_total < 0 THEN RAISE EXCEPTION 'invalid_quote_total'; END IF;
  v_quote_number := public.generate_quote_number();
  SELECT p.full_name INTO v_seller_name FROM public.profiles p WHERE p.user_id=_seller_id;

  INSERT INTO public.quotes(
    quote_number,client_id,client_name,salesperson,status,quote_date,total,discount,notes,
    created_by,total_amount,salesperson_id,payment_terms,shipping_deadline,shipping_method,shipping_cost,
    proposal_validity,followup_date,payment_method,payment_status,is_reseller,payment_date,installments,
    is_split_payment,split_method_1,split_value_1,split_date_1,split_installments_1,
    split_method_2,split_value_2,split_date_2,split_installments_2,
    use_alt_shipping_address,shipping_recipient,shipping_cep,shipping_address,shipping_address_number,
    shipping_complement,shipping_neighborhood,shipping_city,shipping_state,shipping_phone,shipping_notes,
    is_demonstration,demonstration_start_date,demonstration_end_date,company_id,
    is_transitional,emergency_operator_id,emergency_for_user_id,emergency_mode,
    regularization_status,emergency_reason,billing_send_status
  ) VALUES (
    v_quote_number,_client_id,coalesce(nullif(v_client.company_name,''),v_client.name),
    coalesce(v_seller_name,'Atendimento emergencial'),'draft',current_date,
    coalesce(nullif(_quote_data->>'total_amount','')::numeric,0),
    coalesce(nullif(_quote_data->>'discount','')::numeric,0),
    concat_ws(E'\n',nullif(_quote_data->>'notes',''),'EMISSÃO EMERGENCIAL — '||trim(_reason)),
    v_operator,v_total,_seller_id,
    nullif(_quote_data->>'payment_terms',''),nullif(_quote_data->>'shipping_deadline',''),
    nullif(_quote_data->>'shipping_method',''),coalesce(nullif(_quote_data->>'shipping_cost','')::numeric,0),
    nullif(_quote_data->>'proposal_validity',''),
    nullif(_quote_data->>'followup_date','')::timestamptz,
    nullif(_quote_data->>'payment_method',''),coalesce(nullif(_quote_data->>'payment_status',''),'pendente'),
    coalesce(nullif(_quote_data->>'is_reseller','')::boolean,false),
    nullif(_quote_data->>'payment_date','')::date,
    coalesce(nullif(_quote_data->>'installments','')::integer,1),
    coalesce(nullif(_quote_data->>'is_split_payment','')::boolean,false),
    nullif(_quote_data->>'split_method_1',''),coalesce(nullif(_quote_data->>'split_value_1','')::numeric,0),
    nullif(_quote_data->>'split_date_1','')::date,coalesce(nullif(_quote_data->>'split_installments_1','')::integer,1),
    nullif(_quote_data->>'split_method_2',''),coalesce(nullif(_quote_data->>'split_value_2','')::numeric,0),
    nullif(_quote_data->>'split_date_2','')::date,coalesce(nullif(_quote_data->>'split_installments_2','')::integer,1),
    coalesce(nullif(_quote_data->>'use_alt_shipping_address','')::boolean,false),
    nullif(_quote_data->>'shipping_recipient',''),nullif(_quote_data->>'shipping_cep',''),
    nullif(_quote_data->>'shipping_address',''),nullif(_quote_data->>'shipping_address_number',''),
    nullif(_quote_data->>'shipping_complement',''),nullif(_quote_data->>'shipping_neighborhood',''),
    nullif(_quote_data->>'shipping_city',''),nullif(_quote_data->>'shipping_state',''),
    nullif(_quote_data->>'shipping_phone',''),nullif(_quote_data->>'shipping_notes',''),
    coalesce(nullif(_quote_data->>'is_demonstration','')::boolean,false),
    nullif(_quote_data->>'demonstration_start_date','')::date,
    nullif(_quote_data->>'demonstration_end_date','')::date,
    v_company,true,v_operator,_seller_id,_mode,'pending',trim(_reason),'pending'
  ) RETURNING id INTO v_quote_id;

  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(_items) AS x(
      item_number integer, product_code text, quantity integer, model text, brand text,
      specifications text, unit_price numeric, discount_percent numeric, unit_total numeric,
      line_total numeric, image_url text, is_gift boolean, description_layout text,
      transfer_status text, is_presale boolean
    )
  LOOP
    v_idx := v_idx + 1;
    IF coalesce(v_item.quantity,0) < 1 OR coalesce(v_item.quantity,0) > 999 THEN
      RAISE EXCEPTION 'invalid_product_quantity';
    END IF;
    IF coalesce(v_item.unit_price,0) < 0 OR coalesce(v_item.discount_percent,0) < 0
       OR coalesce(v_item.discount_percent,0) > 100 THEN RAISE EXCEPTION 'invalid_item_price_or_discount'; END IF;
    INSERT INTO public.quote_items(
      quote_id,item_number,code,description,quantity,unit_price,total_price,category,model,brand,
      specifications,discount_percent,unit_total,line_total,product_code,image_url,is_gift,
      description_layout,transfer_status,is_presale
    ) VALUES (
      v_quote_id,v_idx,v_item.product_code,v_item.model,v_item.quantity,v_item.unit_price,
      coalesce(v_item.line_total,0),null,v_item.model,v_item.brand,v_item.specifications,
      coalesce(v_item.discount_percent,0),coalesce(v_item.unit_total,v_item.unit_price),
      coalesce(v_item.line_total,0),v_item.product_code,v_item.image_url,
      coalesce(v_item.is_gift,false),coalesce(v_item.description_layout,'compact'),
      v_item.transfer_status,coalesce(v_item.is_presale,false)
    );
  END LOOP;
  RETURN QUERY SELECT v_quote_id,v_quote_number,v_total;
END;
$function$;
REVOKE ALL ON FUNCTION public.create_emergency_quote_full(uuid,uuid,text,text,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_emergency_quote_full(uuid,uuid,text,text,jsonb,jsonb) TO authenticated;