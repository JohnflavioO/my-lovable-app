CREATE OR REPLACE FUNCTION public.generate_smart_opportunities_for_quote(p_quote_id UUID)
RETURNS void AS $$
DECLARE
    v_client_id UUID;
    v_vendedor_id UUID;
    v_status TEXT;
    v_item RECORD;
    v_rel RECORD;
    v_mapped_type TEXT;
BEGIN
    -- Busca dados do orçamento
    SELECT client_id, salesperson_id, status 
    INTO v_client_id, v_vendedor_id, v_status
    FROM public.quotes
    WHERE id = p_quote_id;

    -- Verifica se o status é um dos permitidos
    IF v_status NOT IN ('Aprovado', 'Entregue', 'Faturado') THEN
        RETURN;
    END IF;

    -- Para cada item do orçamento
    FOR v_item IN (
        SELECT p.id as product_id, qi.description
        FROM public.quote_items qi
        JOIN public.products p ON p.code = qi.product_code OR p.sku = qi.product_code
        WHERE qi.quote_id = p_quote_id
    ) LOOP
        -- Busca produtos relacionados
        FOR v_rel IN (
            SELECT related_product_id, tipo_relacao, observacao
            FROM public.product_relationships
            WHERE product_id = v_item.product_id
        ) LOOP
            -- Mapeia o tipo interno para o texto da constraint/UI
            v_mapped_type := CASE v_rel.tipo_relacao
                WHEN 'cross_sell' THEN 'Cross-sell'
                WHEN 'upsell' THEN 'Upsell'
                WHEN 'acessorio' THEN 'Acessório recomendado'
                WHEN 'upgrade' THEN 'Upgrade de equipamento'
                ELSE 'Cross-sell'
            END;

            -- Insere a oportunidade se não existir duplicada (mesmo cliente + produto sugerido)
            INSERT INTO public.smart_opportunities (
                cliente_id,
                vendedor_id,
                produto_base,
                produto_sugerido,
                tipo_oportunidade,
                motivo,
                prioridade,
                status
            )
            SELECT 
                v_client_id,
                v_vendedor_id,
                v_item.product_id,
                v_rel.related_product_id,
                v_mapped_type,
                'Cliente comprou ' || v_item.description,
                'média',
                'Nova'
            WHERE NOT EXISTS (
                SELECT 1 FROM public.smart_opportunities 
                WHERE cliente_id = v_client_id 
                AND produto_sugerido = v_rel.related_product_id
                AND status != 'Descartada'
            );
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
