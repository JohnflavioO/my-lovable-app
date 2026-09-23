DROP POLICY IF EXISTS "Gestors can view all clients" ON public.clients;
DROP POLICY IF EXISTS "Gestors can view all quotes" ON public.quotes;

CREATE OR REPLACE FUNCTION public.get_team_dashboard_sellers()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  clients_count bigint,
  quotes_count bigint,
  total_value numeric,
  approved_count bigint,
  pending_count bigint,
  rejected_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_gestor() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT
    p.user_id,
    p.full_name,
    COUNT(DISTINCT c.id) AS clients_count,
    COUNT(DISTINCT q.id) AS quotes_count,
    COALESCE(SUM(COALESCE(q.total_amount, q.total, 0)), 0) AS total_value,
    COUNT(DISTINCT q.id) FILTER (WHERE q.status = 'approved') AS approved_count,
    COUNT(DISTINCT q.id) FILTER (WHERE q.status IN ('draft', 'sent', 'pre_venda', 'contato_feito', 'negociacao')) AS pending_count,
    COUNT(DISTINCT q.id) FILTER (WHERE q.status = 'rejected') AS rejected_count
  FROM public.profiles p
  LEFT JOIN public.clients c ON c.created_by = p.user_id
  LEFT JOIN public.quotes q ON q.created_by = p.user_id
  WHERE p.active = true
    AND p.commercial_visible = true
  GROUP BY p.user_id, p.full_name
  ORDER BY p.full_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_team_dashboard_recent_quotes(p_owner uuid DEFAULT NULL, p_limit integer DEFAULT 8)
RETURNS TABLE (
  id uuid,
  quote_number text,
  client_name text,
  created_by uuid,
  total_amount numeric,
  shipping_cost numeric,
  status text,
  payment_method text,
  payment_status text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_gestor() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT
    q.id,
    q.quote_number,
    COALESCE(NULLIF(c.company_name, ''), NULLIF(c.name, ''), NULLIF(q.client_name, ''), 'Sem cliente') AS client_name,
    q.created_by,
    COALESCE(q.total_amount, q.total, 0) AS total_amount,
    COALESCE(q.shipping_cost, 0) AS shipping_cost,
    COALESCE(q.status, 'draft') AS status,
    q.payment_method,
    q.payment_status,
    q.created_at
  FROM public.quotes q
  LEFT JOIN public.clients c ON c.id = q.client_id
  WHERE p_owner IS NULL OR q.created_by = p_owner
  ORDER BY q.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 8), 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_team_dashboard_top_clients(p_owner uuid DEFAULT NULL, p_limit integer DEFAULT 5)
RETURNS TABLE (
  client_id uuid,
  client_name text,
  total_value numeric,
  quotes_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_gestor() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT
    q.client_id,
    COALESCE(NULLIF(c.company_name, ''), NULLIF(c.name, ''), NULLIF(q.client_name, ''), 'Sem cliente') AS client_name,
    COALESCE(SUM(COALESCE(q.total_amount, q.total, 0)), 0) AS total_value,
    COUNT(*) AS quotes_count
  FROM public.quotes q
  LEFT JOIN public.clients c ON c.id = q.client_id
  WHERE q.client_id IS NOT NULL
    AND (p_owner IS NULL OR q.created_by = p_owner)
  GROUP BY q.client_id, COALESCE(NULLIF(c.company_name, ''), NULLIF(c.name, ''), NULLIF(q.client_name, ''), 'Sem cliente')
  ORDER BY total_value DESC, quotes_count DESC
  LIMIT GREATEST(COALESCE(p_limit, 5), 1);
END;
$$;