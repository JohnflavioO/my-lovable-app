-- Preço só vem da loja quando o vínculo é certeiro:
--  * código do CRM = SKU atual na loja (conferido a cada consulta), ou
--  * vínculo confirmado por uma pessoa para AQUELE item da loja.
-- Vínculos por nome erraram (ex.: "RAY 60C" ligado ao "Ray 660c"), então exigem confirmação.

ALTER TABLE public.li_price_snapshot
  ADD COLUMN IF NOT EXISTS external_sku text;   -- SKU atual na loja, lido a cada consulta

ALTER TABLE public.product_external_links
  ADD COLUMN IF NOT EXISTS price_confirmed_external_id text,
  ADD COLUMN IF NOT EXISTS price_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS price_confirmed_at timestamptz;

-- Código do CRM bate com o SKU atual da loja (ignora espaços e zeros à esquerda).
CREATE OR REPLACE FUNCTION public.li_code_matches(_code text, _sku text, _store_sku text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(nullif(ltrim(btrim(_store_sku), '0'), ''), '#') IN (
    coalesce(nullif(ltrim(btrim(_code), '0'), ''), '?'),
    coalesce(nullif(ltrim(btrim(_sku), '0'), ''), '?')
  )
$$;

-- Pessoa confirma (ou recusa) que o produto do CRM é o mesmo item da loja.
CREATE OR REPLACE FUNCTION public.confirm_li_link(_product_id uuid, _same boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.can_edit_products() THEN
    RAISE EXCEPTION 'Sem permissão para alterar produtos' USING ERRCODE = '42501';
  END IF;
  IF _same THEN
    UPDATE public.product_external_links
       SET price_confirmed_external_id = external_product_id,
           price_confirmed_by = auth.uid(),
           price_confirmed_at = now()
     WHERE product_id = _product_id AND provider = 'loja_integrada' AND sync_status = 'linked';
  ELSE
    -- Sai da sincronização e volta para a fila de "Mapeamento de Produtos".
    UPDATE public.product_external_links
       SET sync_status = 'needs_validation',
           price_confirmed_external_id = NULL,
           price_confirmed_by = auth.uid(),
           price_confirmed_at = now()
     WHERE product_id = _product_id AND provider = 'loja_integrada';
    DELETE FROM public.li_price_snapshot WHERE product_id = _product_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_li_link(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_li_link(uuid, boolean) TO authenticated, service_role;

-- Leitura do status de confirmação pela tela (sem abrir a tabela de vínculos).
CREATE OR REPLACE FUNCTION public.li_link_trust()
RETURNS TABLE (product_id uuid, code_matches boolean, confirmed boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.product_id,
         public.li_code_matches(p.code, p.sku, s.external_sku),
         (l.price_confirmed_external_id IS NOT NULL AND l.price_confirmed_external_id = l.external_product_id)
    FROM public.li_price_snapshot s
    JOIN public.products p ON p.id = s.product_id
    JOIN public.product_external_links l ON l.product_id = s.product_id AND l.provider = 'loja_integrada'
   WHERE public.can_edit_products()
$$;
REVOKE ALL ON FUNCTION public.li_link_trust() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.li_link_trust() TO authenticated, service_role;

-- apply_li_prices passa a recusar vínculo que não seja código igual ou confirmado.
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
    SELECT p.id, p.price, s.preco_cheio, s.preco_promocional, s.sob_consulta, s.error,
           (public.li_code_matches(p.code, p.sku, s.external_sku)
             OR (l.price_confirmed_external_id IS NOT NULL AND l.price_confirmed_external_id = l.external_product_id)) AS trusted
      FROM public.products p
      JOIN public.li_price_snapshot s ON s.product_id = p.id
      JOIN public.product_external_links l ON l.product_id = p.id AND l.provider = 'loja_integrada' AND l.sync_status = 'linked'
     WHERE p.id = ANY(_product_ids)
  LOOP
    IF NOT r.trusted OR r.error IS NOT NULL OR r.sob_consulta OR coalesce(r.preco_cheio, 0) <= 0 THEN
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
