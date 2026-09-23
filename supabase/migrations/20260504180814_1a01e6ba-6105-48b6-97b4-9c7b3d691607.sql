CREATE OR REPLACE FUNCTION public.process_smart_opportunities_diagnostics()
RETURNS JSONB AS $$
DECLARE
    v_quote RECORD;
    v_item RECORD;
    v_rel RECORD;
    v_created_count INTEGER := 0;
    v_ignored_count INTEGER := 0;
    v_analyzed_quotes INTEGER := 0;
    v_removed_count INTEGER := 0;
    v_details JSONB := '[]'::JSONB;
    v_motivo TEXT;
    v_tipo_val TEXT;
    v_prioridade_val TEXT;
BEGIN
    -- Limpar oportunidades duplicadas ou que não batem mais com a realidade
    DELETE FROM public.smart_opportunities so
    USING public.quotes q
    WHERE so.quote_id = q.id
    AND q.status NOT ILIKE 'Aprovado' 
    AND q.status NOT ILIKE 'approved'
    AND q.status NOT IN ('Entregue', 'Faturado');
    GET DIAGNOSTICS v_removed_count = ROW_COUNT;

    -- Loop por todos os orçamentos aprovados/reais
    FOR v_quote IN 
        SELECT id, client_id, salesperson_id, company_id, status
        FROM public.quotes 
        WHERE (status ILIKE 'Aprovado' OR status ILIKE 'approved' OR status IN ('Entregue', 'Faturado'))
        AND client_id IS NOT NULL
        AND salesperson_id IS NOT NULL
    LOOP
        v_analyzed_quotes := v_analyzed_quotes + 1;
        
        -- Loop pelos itens reais do orçamento
        FOR v_item IN 
            SELECT p.id as p_id, p.name as p_name, p.category_principal as p_cat, p.level as p_level
            FROM public.quote_items qi
            JOIN public.products p ON (p.code = qi.product_code OR p.sku = qi.product_code OR p.id::text = qi.product_code)
            WHERE qi.quote_id = v_quote.id
        LOOP
            
            -- Buscar relacionamentos cadastrados estritamente
            FOR v_rel IN 
                SELECT 
                    pr.related_product_id, 
                    pr.tipo_relacao,
                    p_sug.name as sug_name,
                    p_sug.category_principal as sug_cat,
                    p_sug.level as sug_level
                FROM public.product_relationships pr
                JOIN public.products p_sug ON pr.related_product_id = p_sug.id
                WHERE pr.product_id = v_item.p_id
            LOOP
                
                -- VALIDAÇÃO DE COMPATIBILIDADE TÉCNICA
                
                -- Regra 1: Não sugerir downgrade de nível
                IF v_item.p_level = 'profissional' AND v_rel.sug_level = 'entrada' THEN
                    v_ignored_count := v_ignored_count + 1;
                    v_details := v_details || jsonb_build_object(
                        'quote_id', v_quote.id,
                        'reason', 'Downgrade ignorado: ' || v_item.p_name || ' -> ' || v_rel.sug_name
                    );
                    CONTINUE;
                END IF;

                -- Regra 2: Cruzamento Proibido (Lente x Luz)
                IF v_item.p_cat ILIKE '%Lente%' AND v_rel.sug_cat ILIKE '%Luz%' THEN
                    v_ignored_count := v_ignored_count + 1;
                    v_details := v_details || jsonb_build_object(
                        'quote_id', v_quote.id,
                        'reason', 'Incompatibilidade: Lente ('||v_item.p_name||') vs Luz ('||v_rel.sug_name||')'
                    );
                    CONTINUE;
                END IF;

                -- Regra 3: Cruzamento Proibido (Luz x Lente)
                IF v_item.p_cat ILIKE '%Luz%' AND v_rel.sug_cat ILIKE '%Lente%' THEN
                    v_ignored_count := v_ignored_count + 1;
                    v_details := v_details || jsonb_build_object(
                        'quote_id', v_quote.id,
                        'reason', 'Incompatibilidade: Luz ('||v_item.p_name||') vs Lente ('||v_rel.sug_name||')'
                    );
                    CONTINUE;
                END IF;

                -- Construção de Metadados
                v_tipo_val := CASE 
                    WHEN v_rel.tipo_relacao = 'upsell' THEN 'Upsell'
                    WHEN v_rel.tipo_relacao = 'acessorio' THEN 'Acessório recomendado'
                    WHEN v_rel.tipo_relacao = 'upgrade' THEN 'Upgrade de equipamento'
                    ELSE 'Cross-sell'
                END;

                v_prioridade_val := CASE 
                    WHEN v_rel.tipo_relacao = 'upsell' OR v_rel.tipo_relacao = 'upgrade' THEN 'alta'
                    WHEN v_rel.tipo_relacao = 'acessorio' THEN 'média'
                    ELSE 'baixa'
                END;

                v_motivo := format('Baseado no orçamento aprovado %s: Cliente adquiriu %s. Sugerimos %s (%s) para elevar a performance do setup.', 
                    v_quote.id, v_item.p_name, v_rel.sug_name, v_rel.sug_cat);

                -- Inserção Estrita
                IF NOT EXISTS (
                    SELECT 1 FROM public.smart_opportunities 
                    WHERE cliente_id = v_quote.client_id 
                    AND produto_sugerido = v_rel.related_product_id
                    AND (quote_id = v_quote.id OR created_at > now() - interval '30 days')
                ) THEN
                    INSERT INTO public.smart_opportunities (
                        cliente_id,
                        vendedor_id,
                        produto_base,
                        produto_sugerido,
                        quote_id,
                        tipo_oportunidade,
                        motivo,
                        prioridade,
                        status,
                        company_id
                    ) VALUES (
                        v_quote.client_id,
                        v_quote.salesperson_id,
                        v_item.p_id,
                        v_rel.related_product_id,
                        v_quote.id,
                        v_tipo_val,
                        v_motivo,
                        v_prioridade_val,
                        'Nova',
                        v_quote.company_id
                    );
                    v_created_count := v_created_count + 1;
                END IF;

            END LOOP;
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object(
        'analyzed_quotes', v_analyzed_quotes,
        'created_count', v_created_count,
        'ignored_count', v_ignored_count,
        'removed_count', v_removed_count,
        'details', v_details
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
