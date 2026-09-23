
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
    COALESCE(c_agg.cnt, 0) AS clients_count,
    COALESCE(q_agg.cnt, 0) AS quotes_count,
    COALESCE(q_agg.total_val, 0) AS total_value,
    COALESCE(q_agg.approved_cnt, 0) AS approved_count,
    COALESCE(q_agg.pending_cnt, 0) AS pending_count,
    COALESCE(q_agg.rejected_cnt, 0) AS rejected_count
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM public.clients cl
    WHERE cl.created_by = p.user_id
  ) c_agg ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS cnt,
      COALESCE(SUM(COALESCE(q.total_amount, q.total, 0)), 0) AS total_val,
      COUNT(*) FILTER (WHERE q.status = 'approved') AS approved_cnt,
      COUNT(*) FILTER (WHERE q.status IN ('draft', 'sent', 'pre_venda', 'contato_feito', 'negociacao')) AS pending_cnt,
      COUNT(*) FILTER (WHERE q.status = 'rejected') AS rejected_cnt
    FROM public.quotes q
    WHERE q.created_by = p.user_id
  ) q_agg ON true
  WHERE p.active = true
    AND p.commercial_visible = true
  ORDER BY p.full_name;
END;
$$;
