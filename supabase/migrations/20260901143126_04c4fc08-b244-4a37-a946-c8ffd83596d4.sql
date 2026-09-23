CREATE OR REPLACE FUNCTION public.quote_has_presale_item(_quote_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.quote_items qi
    WHERE qi.quote_id = _quote_id
      AND qi.is_presale IS TRUE
  )
$$;

REVOKE ALL ON FUNCTION public.quote_has_presale_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quote_has_presale_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quote_has_presale_item(uuid) TO service_role;

DROP POLICY IF EXISTS "Logistica can view company presales" ON public.quotes;
CREATE POLICY "Logistica can view company presales"
ON public.quotes
FOR SELECT
TO authenticated
USING (
  public.is_logistica()
  AND company_id IS NOT NULL
  AND company_id = public.current_user_company_id()
  AND (
    lower(coalesce(status, '')) IN ('pre_venda', 'pre-venda', 'pre_sale')
    OR public.quote_has_presale_item(id)
  )
);

CREATE OR REPLACE FUNCTION public.start_presale_logistics(p_quote_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_quote_company_id uuid;
  v_quote_status text;
  v_record_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_logistica() THEN
    RAISE EXCEPTION 'Apenas a equipe de Logística pode iniciar este pedido';
  END IF;

  v_company_id := public.current_user_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa vinculada';
  END IF;

  SELECT q.company_id, lower(coalesce(q.status, ''))
    INTO v_quote_company_id, v_quote_status
  FROM public.quotes q
  WHERE q.id = p_quote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposta não encontrada';
  END IF;

  IF v_quote_company_id IS DISTINCT FROM v_company_id THEN
    RAISE EXCEPTION 'Proposta não pertence à empresa do usuário';
  END IF;

  IF v_quote_status NOT IN ('pre_venda', 'pre-venda', 'pre_sale')
     AND NOT public.quote_has_presale_item(p_quote_id) THEN
    RAISE EXCEPTION 'A proposta não está marcada como pré-venda';
  END IF;

  INSERT INTO public.logistics_records (quote_id, logistics_status, company_id)
  VALUES (p_quote_id, 'aguardando_entrada', v_company_id)
  ON CONFLICT (quote_id) DO UPDATE
    SET company_id = EXCLUDED.company_id
  RETURNING id INTO v_record_id;

  RETURN v_record_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_presale_logistics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_presale_logistics(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_presale_logistics(uuid) TO service_role;