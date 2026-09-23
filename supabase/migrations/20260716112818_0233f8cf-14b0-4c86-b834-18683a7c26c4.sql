
-- product_equivalences
CREATE TABLE IF NOT EXISTS public.product_equivalences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_externo TEXT,
  marca_externa TEXT,
  modelo_externo TEXT,
  url_externa TEXT,
  mci_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  confidence NUMERIC(5,2) DEFAULT 0,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  company_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_equivalences TO authenticated;
GRANT ALL ON public.product_equivalences TO service_role;
ALTER TABLE public.product_equivalences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can read equivalences"
  ON public.product_equivalences FOR SELECT TO authenticated
  USING (public.is_approved());
CREATE POLICY "Approved users can insert equivalences"
  ON public.product_equivalences FOR INSERT TO authenticated
  WITH CHECK (public.is_approved() AND approved_by = auth.uid());
CREATE POLICY "Approvers or admin can update equivalences"
  ON public.product_equivalences FOR UPDATE TO authenticated
  USING (public.is_approved() AND (approved_by = auth.uid() OR public.is_admin() OR public.is_gestor()))
  WITH CHECK (public.is_approved());
CREATE POLICY "Admin/gestor can delete equivalences"
  ON public.product_equivalences FOR DELETE TO authenticated
  USING (public.is_admin() OR public.is_gestor());

CREATE INDEX IF NOT EXISTS idx_equiv_url ON public.product_equivalences (url_externa);
CREATE INDEX IF NOT EXISTS idx_equiv_marca_modelo ON public.product_equivalences (marca_externa, modelo_externo);
CREATE INDEX IF NOT EXISTS idx_equiv_product ON public.product_equivalences (mci_product_id);

CREATE TRIGGER trg_equiv_updated_at BEFORE UPDATE ON public.product_equivalences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_equiv_company BEFORE INSERT ON public.product_equivalences
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_current_user();

-- equivalence_search_history
CREATE TABLE IF NOT EXISTS public.equivalence_search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID,
  input_type TEXT NOT NULL CHECK (input_type IN ('url','text','sku','name','code')),
  input_value TEXT NOT NULL,
  extracted_specs JSONB DEFAULT '{}'::jsonb,
  chosen_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  response_time_ms INTEGER,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equivalence_search_history TO authenticated;
GRANT ALL ON public.equivalence_search_history TO service_role;
ALTER TABLE public.equivalence_search_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own history"
  ON public.equivalence_search_history FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin() OR public.is_gestor());
CREATE POLICY "Users insert own history"
  ON public.equivalence_search_history FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_approved());
CREATE POLICY "Users update own history"
  ON public.equivalence_search_history FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own history"
  ON public.equivalence_search_history FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE INDEX IF NOT EXISTS idx_history_user_created ON public.equivalence_search_history (user_id, created_at DESC);

CREATE TRIGGER trg_history_company BEFORE INSERT ON public.equivalence_search_history
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_current_user();

-- equivalence_search_cache
CREATE TABLE IF NOT EXISTS public.equivalence_search_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input_hash TEXT NOT NULL UNIQUE,
  input_type TEXT NOT NULL,
  input_value TEXT,
  extracted_specs JSONB DEFAULT '{}'::jsonb,
  candidates JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equivalence_search_cache TO authenticated;
GRANT ALL ON public.equivalence_search_cache TO service_role;
ALTER TABLE public.equivalence_search_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users read cache"
  ON public.equivalence_search_cache FOR SELECT TO authenticated
  USING (public.is_approved());
CREATE POLICY "Approved users write cache"
  ON public.equivalence_search_cache FOR INSERT TO authenticated
  WITH CHECK (public.is_approved());
CREATE POLICY "Approved users update cache"
  ON public.equivalence_search_cache FOR UPDATE TO authenticated
  USING (public.is_approved()) WITH CHECK (public.is_approved());
CREATE POLICY "Admin can delete cache"
  ON public.equivalence_search_cache FOR DELETE TO authenticated
  USING (public.is_admin() OR public.is_gestor());

CREATE INDEX IF NOT EXISTS idx_cache_expires ON public.equivalence_search_cache (expires_at);

-- Search RPC for pre-filtering candidates using trigram + ILIKE
CREATE OR REPLACE FUNCTION public.search_product_candidates(
  p_query TEXT,
  p_brand TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
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
        + CASE WHEN p_brand IS NOT NULL AND p.brand ILIKE '%' || p_brand || '%' THEN 0.4 ELSE 0 END
        + CASE WHEN p_category IS NOT NULL AND p.category_principal ILIKE '%' || p_category || '%' THEN 0.3 ELSE 0 END
      )::real AS score
    FROM public.products p
  )
  SELECT * FROM scored
  WHERE score > 0
  ORDER BY score DESC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limit, 20), 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_product_candidates(TEXT, TEXT, TEXT, INTEGER) TO authenticated;
