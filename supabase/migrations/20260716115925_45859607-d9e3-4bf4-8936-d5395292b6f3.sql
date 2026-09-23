-- Expand product candidate search with keyword-based matching for better equivalence
CREATE OR REPLACE FUNCTION public.search_product_candidates(
  p_query TEXT,
  p_brand TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_keywords TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  brand TEXT,
  code TEXT,
  sku TEXT,
  category_principal TEXT,
  description TEXT,
  price NUMERIC,
  image_url TEXT,
  compatibility TEXT,
  score REAL
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query TEXT := COALESCE(NULLIF(trim(p_query), ''), '');
  v_kw TEXT[] := COALESCE(p_keywords, ARRAY[]::TEXT[]);
BEGIN
  RETURN QUERY
  WITH scored AS (
    SELECT
      p.id, p.name, p.brand, p.code, p.sku, p.category_principal,
      p.description, p.price, p.image_url, p.compatibility,
      (
        CASE WHEN v_query <> '' AND (p.sku ILIKE v_query OR p.code ILIKE v_query) THEN 1.0 ELSE 0 END
        + CASE WHEN v_query <> '' THEN GREATEST(
            similarity(COALESCE(p.name,''), v_query),
            similarity(COALESCE(p.brand,'') || ' ' || COALESCE(p.name,''), v_query)
          ) ELSE 0 END
        + CASE WHEN p_brand IS NOT NULL AND p.brand ILIKE '%' || p_brand || '%' THEN 0.3 ELSE 0 END
        + CASE WHEN p_category IS NOT NULL AND p.category_principal ILIKE '%' || p_category || '%' THEN 0.25 ELSE 0 END
        + (
          SELECT COALESCE(SUM(
            CASE WHEN kw <> '' AND (
                 COALESCE(p.name,'') ILIKE '%' || kw || '%'
              OR COALESCE(p.description,'') ILIKE '%' || kw || '%'
              OR COALESCE(p.category_principal,'') ILIKE '%' || kw || '%'
              OR COALESCE(p.compatibility,'') ILIKE '%' || kw || '%'
            ) THEN 0.15 ELSE 0 END
          ), 0)
          FROM unnest(v_kw) AS kw
        )
      )::real AS score
    FROM public.products p
  )
  SELECT * FROM scored
  WHERE score > 0.05
  ORDER BY score DESC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limit, 20), 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_product_candidates(TEXT, TEXT, TEXT, INTEGER, TEXT[]) TO authenticated;