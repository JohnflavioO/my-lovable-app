CREATE OR REPLACE FUNCTION public.validate_emergency_quote_payment(_quote_data jsonb, _total numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_split boolean := coalesce(nullif(_quote_data->>'is_split_payment','')::boolean,false);
  v_method text := lower(coalesce(_quote_data->>'payment_method',''));
  v_m1 text := lower(coalesce(_quote_data->>'split_method_1',''));
  v_m2 text := lower(coalesce(_quote_data->>'split_method_2',''));
  v_v1 numeric := coalesce(nullif(_quote_data->>'split_value_1','')::numeric,0);
  v_v2 numeric := coalesce(nullif(_quote_data->>'split_value_2','')::numeric,0);
  v_i1 integer := coalesce(nullif(_quote_data->>'split_installments_1','')::integer,1);
  v_i2 integer := coalesce(nullif(_quote_data->>'split_installments_2','')::integer,1);
  v_i integer := coalesce(nullif(_quote_data->>'installments','')::integer,1);
BEGIN
  IF v_split THEN
    IF v_m1 NOT IN ('pix','cartao','boleto','parceria') OR v_m2 NOT IN ('pix','cartao','boleto','parceria') OR v_m1=v_m2 THEN
      RAISE EXCEPTION 'invalid_split_payment_methods';
    END IF;
    IF v_v1<=0 OR v_v2<=0 OR (_total>0 AND abs((v_v1+v_v2)-_total)>0.01) THEN
      RAISE EXCEPTION 'invalid_split_payment_values';
    END IF;
    IF v_m1='pix' AND nullif(_quote_data->>'split_date_1','') IS NULL THEN RAISE EXCEPTION 'split_payment_1_date_required'; END IF;
    IF v_m2='pix' AND nullif(_quote_data->>'split_date_2','') IS NULL THEN RAISE EXCEPTION 'split_payment_2_date_required'; END IF;
    IF v_m1='boleto' AND (nullif(_quote_data->>'split_date_1','') IS NULL OR v_i1 NOT BETWEEN 1 AND 10) THEN RAISE EXCEPTION 'invalid_split_boleto_1_terms'; END IF;
    IF v_m2='boleto' AND (nullif(_quote_data->>'split_date_2','') IS NULL OR v_i2 NOT BETWEEN 1 AND 10) THEN RAISE EXCEPTION 'invalid_split_boleto_2_terms'; END IF;
    IF v_m1='cartao' AND v_i1 NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'invalid_split_card_1_installments'; END IF;
    IF v_m2='cartao' AND v_i2 NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'invalid_split_card_2_installments'; END IF;
  ELSE
    IF v_method NOT IN ('pix','cartao','boleto','parceria') THEN RAISE EXCEPTION 'payment_method_required'; END IF;
    IF v_method='pix' AND nullif(_quote_data->>'payment_date','') IS NULL THEN RAISE EXCEPTION 'payment_date_required'; END IF;
    IF v_method='boleto' AND (nullif(_quote_data->>'payment_date','') IS NULL OR v_i NOT BETWEEN 1 AND 10) THEN RAISE EXCEPTION 'invalid_boleto_terms'; END IF;
    IF v_method='cartao' AND v_i NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'invalid_card_installments'; END IF;
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.validate_emergency_quote_payment(jsonb,numeric) FROM PUBLIC, anon, authenticated;

DO $do$
DECLARE v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.create_emergency_quote_full(uuid,uuid,text,text,jsonb,jsonb)'::regprocedure)
    INTO v_definition;
  IF position('PERFORM public.validate_emergency_quote_payment(_quote_data,v_total);' in v_definition)=0 THEN
    v_definition := replace(
      v_definition,
      'v_total := coalesce(nullif(_quote_data->>''total_amount'','''')::numeric,0);',
      'v_total := coalesce(nullif(_quote_data->>''total_amount'','''')::numeric,0);' || E'\n  PERFORM public.validate_emergency_quote_payment(_quote_data,v_total);'
    );
    EXECUTE v_definition;
  END IF;
END
$do$;