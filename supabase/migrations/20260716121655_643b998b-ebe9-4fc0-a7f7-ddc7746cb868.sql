
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
        CASE WHEN v_query <> '' AND (
             COALESCE(p.sku,'')  ILIKE '%' || v_query || '%'
          OR COALESCE(p.code,'') ILIKE '%' || v_query || '%'
        ) THEN 1.0 ELSE 0 END
        + CASE WHEN v_query <> '' THEN GREATEST(
            similarity(COALESCE(p.name,''), v_query),
            similarity(COALESCE(p.brand,'') || ' ' || COALESCE(p.name,''), v_query)
          ) ELSE 0 END
        + CASE WHEN v_query <> '' AND (
             COALESCE(p.name,'')        ILIKE '%' || v_query || '%'
          OR COALESCE(p.description,'') ILIKE '%' || v_query || '%'
        ) THEN 0.35 ELSE 0 END
        + CASE WHEN p_brand IS NOT NULL AND COALESCE(p.brand,'') ILIKE '%' || p_brand || '%' THEN 0.30 ELSE 0 END
        + CASE WHEN p_category IS NOT NULL AND COALESCE(p.category_principal,'') ILIKE '%' || p_category || '%' THEN 0.25 ELSE 0 END
        + (
          SELECT COALESCE(SUM(
            CASE WHEN kw <> '' AND (
                 COALESCE(p.name,'')               ILIKE '%' || kw || '%'
              OR COALESCE(p.description,'')        ILIKE '%' || kw || '%'
              OR COALESCE(p.category_principal,'') ILIKE '%' || kw || '%'
              OR COALESCE(p.compatibility,'')      ILIKE '%' || kw || '%'
              OR COALESCE(p.brand,'')              ILIKE '%' || kw || '%'
              OR COALESCE(p.sku,'')                ILIKE '%' || kw || '%'
              OR COALESCE(p.code,'')               ILIKE '%' || kw || '%'
            ) THEN 0.12 ELSE 0 END
          ), 0)
          FROM unnest(v_kw) AS kw
        )
      )::real AS s
    FROM public.products p
  )
  SELECT
    scored.id, scored.name, scored.brand, scored.code, scored.sku,
    scored.category_principal, scored.description, scored.price,
    scored.image_url, scored.compatibility, scored.s AS score
  FROM scored
  WHERE scored.s > 0.03
  ORDER BY scored.s DESC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limit, 20), 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_product_candidates(TEXT, TEXT, TEXT, INTEGER, TEXT[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.diagnose_product_search(p_term TEXT)
RETURNS TABLE (matches BIGINT, sample JSONB)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH hits AS (
    SELECT id, name, brand, sku, code
    FROM public.products
    WHERE COALESCE(name,'')               ILIKE '%' || p_term || '%'
       OR COALESCE(brand,'')              ILIKE '%' || p_term || '%'
       OR COALESCE(sku,'')                ILIKE '%' || p_term || '%'
       OR COALESCE(code,'')               ILIKE '%' || p_term || '%'
       OR COALESCE(description,'')        ILIKE '%' || p_term || '%'
       OR COALESCE(category_principal,'') ILIKE '%' || p_term || '%'
       OR COALESCE(compatibility,'')      ILIKE '%' || p_term || '%'
    LIMIT 5
  )
  SELECT
    (SELECT COUNT(*) FROM public.products
      WHERE COALESCE(name,'')               ILIKE '%' || p_term || '%'
         OR COALESCE(brand,'')              ILIKE '%' || p_term || '%'
         OR COALESCE(sku,'')                ILIKE '%' || p_term || '%'
         OR COALESCE(code,'')               ILIKE '%' || p_term || '%'
         OR COALESCE(description,'')        ILIKE '%' || p_term || '%'
         OR COALESCE(category_principal,'') ILIKE '%' || p_term || '%'
         OR COALESCE(compatibility,'')      ILIKE '%' || p_term || '%'),
    COALESCE((SELECT jsonb_agg(to_jsonb(hits)) FROM hits), '[]'::jsonb);
$$;

GRANT EXECUTE ON FUNCTION public.diagnose_product_search(TEXT) TO authenticated;
