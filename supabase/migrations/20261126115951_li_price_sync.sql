-- Atualização de preços a partir da Loja Integrada, por categoria, com revisão
-- antes de aplicar e histórico para desfazer. Nada é alterado automaticamente.

-- 1) Quem pode alterar preço: mesma regra das policies de products.
CREATE OR REPLACE FUNCTION public.can_edit_products()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_admin() OR public.is_gestor()
      OR (public.is_approved() AND public.current_user_has_permission('products.edit'))
$$;
REVOKE ALL ON FUNCTION public.can_edit_products() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_products() TO authenticated, service_role;

-- 2) De / Por guardados no produto (o "price" continua sendo o valor usado no orçamento).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_list numeric,          -- De (preço cheio na loja)
  ADD COLUMN IF NOT EXISTS price_promo numeric,         -- Por (preço promocional na loja)
  ADD COLUMN IF NOT EXISTS price_synced_at timestamptz, -- última aplicação vinda da loja
  ADD COLUMN IF NOT EXISTS price_sync_source text;      -- 'loja_integrada' | 'manual'

-- 3) Categorias da Loja Integrada (cache).
CREATE TABLE IF NOT EXISTS public.li_categories (
  id text PRIMARY KEY,
  nome text NOT NULL,
  parent_id text,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.li_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Editors read li categories" ON public.li_categories;
CREATE POLICY "Editors read li categories" ON public.li_categories
  FOR SELECT TO authenticated USING ((SELECT public.can_edit_products()));

-- 4) Retrato dos preços da loja por produto vinculado (cache; não altera o CRM).
CREATE TABLE IF NOT EXISTS public.li_price_snapshot (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  external_product_id text NOT NULL,
  external_name text,
  preco_cheio numeric,
  preco_promocional numeric,
  sob_consulta boolean NOT NULL DEFAULT false,
  ativo boolean,
  category_ids text[] NOT NULL DEFAULT '{}',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  error text
);
CREATE INDEX IF NOT EXISTS idx_li_price_snapshot_categories ON public.li_price_snapshot USING gin (category_ids);
ALTER TABLE public.li_price_snapshot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Editors read li price snapshot" ON public.li_price_snapshot;
CREATE POLICY "Editors read li price snapshot" ON public.li_price_snapshot
  FOR SELECT TO authenticated USING ((SELECT public.can_edit_products()));

-- 5) Histórico de preço (toda aplicação vinda da loja registra o antes/depois).
CREATE TABLE IF NOT EXISTS public.product_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  batch_id uuid,
  old_price numeric,
  new_price numeric,
  list_price numeric,
  promo_price numeric,
  source text NOT NULL,
  category_id text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reverted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_price_history_product ON public.product_price_history (product_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_batch ON public.product_price_history (batch_id);
ALTER TABLE public.product_price_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Editors read price history" ON public.product_price_history;
CREATE POLICY "Editors read price history" ON public.product_price_history
  FOR SELECT TO authenticated USING ((SELECT public.can_edit_products()));

-- 6) Aplica os preços do retrato da loja aos produtos escolhidos.
--    _mode: 'final' (Por quando há promoção válida, senão De) ou 'list' (sempre De).
--    O valor vem do retrato no servidor, não do navegador.
CREATE OR REPLACE FUNCTION public.apply_li_prices(_product_ids uuid[], _mode text DEFAULT 'final', _category_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch uuid := gen_random_uuid();
  v_updated int := 0;
  v_skipped int := 0;
  r record;
  v_new numeric;
BEGIN
  IF NOT public.can_edit_products() THEN
    RAISE EXCEPTION 'Sem permissão para alterar preços' USING ERRCODE = '42501';
  END IF;
  IF _mode NOT IN ('final', 'list') THEN RAISE EXCEPTION 'modo inválido'; END IF;

  FOR r IN
    SELECT p.id, p.price, s.preco_cheio, s.preco_promocional, s.sob_consulta
      FROM public.products p
      JOIN public.li_price_snapshot s ON s.product_id = p.id
     WHERE p.id = ANY(_product_ids)
  LOOP
    IF r.sob_consulta OR coalesce(r.preco_cheio, 0) <= 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    v_new := CASE
      WHEN _mode = 'final' AND coalesce(r.preco_promocional, 0) > 0 AND r.preco_promocional < r.preco_cheio
        THEN r.preco_promocional
      ELSE r.preco_cheio
    END;
    UPDATE public.products
       SET price = v_new,
           price_list = r.preco_cheio,
           price_promo = CASE WHEN coalesce(r.preco_promocional, 0) > 0 AND r.preco_promocional < r.preco_cheio THEN r.preco_promocional END,
           price_synced_at = now(),
           price_sync_source = 'loja_integrada'
     WHERE id = r.id;
    INSERT INTO public.product_price_history (product_id, batch_id, old_price, new_price, list_price, promo_price, source, category_id, changed_by)
    VALUES (r.id, v_batch, r.price, v_new, r.preco_cheio, r.preco_promocional, 'loja_integrada', _category_id, auth.uid());
    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object('batch_id', v_batch, 'updated', v_updated, 'skipped', v_skipped);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_li_prices(uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_li_prices(uuid[], text, text) TO authenticated, service_role;

-- 7) Desfaz um lote: volta ao preço anterior só onde o preço ainda é o aplicado pelo lote
--    (não desfaz alterações feitas depois por outra pessoa).
CREATE OR REPLACE FUNCTION public.revert_price_batch(_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_reverted int := 0; v_kept int := 0; r record;
BEGIN
  IF NOT public.can_edit_products() THEN
    RAISE EXCEPTION 'Sem permissão para alterar preços' USING ERRCODE = '42501';
  END IF;
  FOR r IN
    SELECT h.id, h.product_id, h.old_price, h.new_price, p.price AS current_price
      FROM public.product_price_history h
      JOIN public.products p ON p.id = h.product_id
     WHERE h.batch_id = _batch_id AND h.reverted_at IS NULL
  LOOP
    IF r.current_price IS NOT DISTINCT FROM r.new_price THEN
      UPDATE public.products SET price = r.old_price, price_sync_source = 'manual' WHERE id = r.product_id;
      UPDATE public.product_price_history SET reverted_at = now() WHERE id = r.id;
      v_reverted := v_reverted + 1;
    ELSE
      v_kept := v_kept + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('reverted', v_reverted, 'kept', v_kept);
END;
$$;
REVOKE ALL ON FUNCTION public.revert_price_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revert_price_batch(uuid) TO authenticated, service_role;
