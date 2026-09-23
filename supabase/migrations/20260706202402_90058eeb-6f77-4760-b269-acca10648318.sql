
-- Scoped RPC for logistics tracking
CREATE OR REPLACE FUNCTION public.get_public_logistics_tracking(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record public.logistics_records;
  v_quote_number text;
  v_client_name text;
  v_history jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_record FROM public.logistics_records WHERE public_token = p_token LIMIT 1;
  IF v_record.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT q.quote_number, q.client_name INTO v_quote_number, v_client_name
  FROM public.quotes q WHERE q.id = v_record.quote_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', h.id,
    'new_status', h.new_status,
    'previous_status', h.previous_status,
    'notes', h.notes,
    'created_at', h.created_at
  ) ORDER BY h.created_at DESC), '[]'::jsonb)
  INTO v_history
  FROM public.logistics_action_history h
  WHERE h.logistics_record_id = v_record.id;

  RETURN jsonb_build_object(
    'record', jsonb_build_object(
      'id', v_record.id,
      'logistics_status', v_record.logistics_status,
      'transportadora', v_record.transportadora,
      'codigo_rastreio', v_record.codigo_rastreio,
      'tracking_url', v_record.tracking_url,
      'data_envio', v_record.data_envio,
      'data_entrega', v_record.data_entrega,
      'observacao_logistica', v_record.observacao_logistica,
      'updated_at', v_record.updated_at
    ),
    'quote', jsonb_build_object(
      'quote_number', v_quote_number,
      'client_name', v_client_name
    ),
    'history', v_history
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_logistics_tracking(text) TO anon, authenticated;

-- Scoped RPC for technical order tracking
CREATE OR REPLACE FUNCTION public.get_public_technical_tracking(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.technical_orders;
  v_history jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_order FROM public.technical_orders WHERE public_token = p_token LIMIT 1;
  IF v_order.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', h.id,
    'new_status', h.new_status,
    'previous_status', h.previous_status,
    'created_at', h.created_at
  ) ORDER BY h.created_at), '[]'::jsonb)
  INTO v_history
  FROM public.technical_status_history h
  WHERE h.order_id = v_order.id;

  RETURN jsonb_build_object(
    'order', jsonb_build_object(
      'id', v_order.id,
      'os_number', v_order.os_number,
      'client_name', v_order.client_name,
      'equipment', v_order.equipment,
      'brand', v_order.brand,
      'model', v_order.model,
      'status', v_order.status,
      'estimated_date', v_order.estimated_date
    ),
    'history', v_history
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_technical_tracking(text) TO anon, authenticated;

-- Drop broad anon/authenticated token-based SELECT policies now replaced by scoped RPCs
DROP POLICY IF EXISTS "Public token views logistics record" ON public.logistics_records;
DROP POLICY IF EXISTS "Public token views logistics history" ON public.logistics_action_history;
DROP POLICY IF EXISTS "Public token views item status" ON public.logistics_item_status;
DROP POLICY IF EXISTS "Public token views quote via logistics" ON public.quotes;
DROP POLICY IF EXISTS "Public token views quote items via logistics" ON public.quote_items;
DROP POLICY IF EXISTS "Public can view order by token" ON public.technical_orders;
DROP POLICY IF EXISTS "Public can view status by token" ON public.technical_status_history;
