-- Allows the emergency operator to link their transitional record to the
-- definitive quote created by the selected salesperson. The target must match
-- company, customer and responsible salesperson; no billing or stock changes.
CREATE OR REPLACE FUNCTION public.regularize_emergency_quote(
  _emergency_quote_id uuid,
  _definitive_quote_number text
)
RETURNS TABLE(regularized_quote_number text, regularization_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_operator uuid := auth.uid();
  v_emergency public.quotes%ROWTYPE;
  v_definitive public.quotes%ROWTYPE;
BEGIN
  IF v_operator IS NULL OR NOT public.has_emergency_quote_permission(v_operator) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  SELECT * INTO v_emergency FROM public.quotes q
  WHERE q.id=_emergency_quote_id AND q.is_transitional=true
    AND q.emergency_operator_id=v_operator
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'emergency_quote_not_found_or_not_owned'; END IF;
  IF v_emergency.regularization_status='regularized' THEN
    RAISE EXCEPTION 'emergency_quote_already_regularized';
  END IF;
  SELECT * INTO v_definitive FROM public.quotes q
  WHERE q.quote_number=trim(_definitive_quote_number)
    AND q.is_transitional IS DISTINCT FROM true
    AND q.client_id=v_emergency.client_id
    AND q.salesperson_id=v_emergency.emergency_for_user_id
    AND q.company_id=v_emergency.company_id
  ORDER BY q.created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'definitive_quote_not_found_for_same_client_and_seller'; END IF;
  UPDATE public.quotes SET regularization_status='regularized',
    regularized_quote_id=v_definitive.id,updated_at=now()
  WHERE id=v_emergency.id;
  RETURN QUERY SELECT v_definitive.quote_number,'regularized'::text;
END;
$function$;
REVOKE ALL ON FUNCTION public.regularize_emergency_quote(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regularize_emergency_quote(uuid,text) TO authenticated;