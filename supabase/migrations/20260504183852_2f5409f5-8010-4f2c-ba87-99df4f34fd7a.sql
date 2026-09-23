-- 1. Corrigir a FK de vendedor_id para apontar para auth.users(id)
-- Primeiro removemos a antiga que apontava para profiles(user_id) ou similar
ALTER TABLE public.smart_opportunities DROP CONSTRAINT IF EXISTS smart_opportunities_vendedor_id_fkey;

-- Adicionamos a nova FK apontando para auth.users(id), que é o que quotes(salesperson_id) usa
ALTER TABLE public.smart_opportunities 
ADD CONSTRAINT smart_opportunities_vendedor_id_fkey 
FOREIGN KEY (vendedor_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Atualizar a função de processamento com validações rigorosas
CREATE OR REPLACE FUNCTION public.process_smart_opportunities_diagnostics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_quote RECORD;
    v_item RECORD;
    v_rel RECORD;
    v_created_count INTEGER := 0;
    v_ignored_count INTEGER := 0;
    v_analyzed_quotes INTEGER := 0;
    v_removed_count INTEGER := 0;
    v_invalid_seller_count INTEGER := 0;
    v_invalid_client_count INTEGER := 0;
    v_no_relation_count INTEGER := 0;
    v_motivo TEXT;
    v_tipo_val TEXT;
    v_prioridade_val TEXT;
    v_current_user_id UUID;
    v_company_id UUID;
BEGIN
    -- Obter usuário atual e sua empresa
    v_current_user_id := auth.uid();
    
    -- Tentar obter company_id do perfil do usuário atual
    SELECT company_id INTO v_company_id FROM public.profiles WHERE user_id = v_current_user_id;

    -- Limpar oportunidades obsoletas que pertencem a orçamentos não mais aprovados
    DELETE FROM public.smart_opportunities so
    USING public.quotes q
    WHERE so.quote_id = q.id
    AND (q.status NOT ILIKE 'Aprovado' AND q.status NOT ILIKE 'approved' AND q.status NOT IN ('Entregue', 'Faturado'))
    AND (v_company_id IS NULL OR so.company_id = v_company_id);
    
    GET DIAGNOSTICS v_removed_count = ROW_COUNT;

    -- Loop por orçamentos aprovados
    FOR v_quote IN 
        SELECT q.id, q.client_id, q.salesperson_id, q.company_id, q.status, q.quote_number
        FROM public.quotes q
        WHERE (q.status ILIKE 'Aprovado' OR q.status ILIKE 'approved' OR q.status IN ('Entregue', 'Faturado'))
        AND (v_company_id IS NULL OR q.company_id = v_company_id OR q.company_id IS NULL)
    LOOP
        v_analyzed_quotes := v_analyzed_quotes + 1;
        
        -- VALIDAÇÃO: Cliente deve existir
        IF v_quote.client_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.clients WHERE id = v_quote.client_id) THEN
            v_invalid_client_count := v_invalid_client_count + 1;
            CONTINUE;
        END IF;

        -- VALIDAÇÃO: Vendedor deve existir em auth.users
        IF v_quote.salesperson_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_quote.salesperson_id) THEN
            v_invalid_seller_count := v_invalid_seller_count + 1;
            CONTINUE;
        END IF;

        -- Loop pelos itens do orçamento
        FOR v_item IN 
            SELECT p.id as p_id, p.name as p_name, p.category_principal as p_cat, p.level as p_level
            FROM public.quote_items qi
            JOIN public.products p ON (p.code = qi.product_code OR p.sku = qi.product_code OR p.id::text = qi.product_code)
            WHERE qi.quote_id = v_quote.id
        LOOP
            
            -- Buscar relacionamentos de produtos
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
                AND (v_company_id IS NULL OR pr.company_id = v_company_id OR pr.company_id IS NULL)
            LOOP
                
                -- Validações Técnicas de Compatibilidade
                
                -- 1. Impedir Downgrade (Produto Profissional sugerindo Entrada)
                IF v_item.p_level = 'profissional' AND v_rel.sug_level = 'entrada' THEN
                    v_ignored_count := v_ignored_count + 1;
                    CONTINUE;
                END IF;

                -- 2. Impedir Incompatibilidade Lente/Luz (Lente não sugere Luz e vice-versa)
                IF (v_item.p_cat ILIKE '%Lente%' AND v_rel.sug_cat ILIKE '%Luz%') OR 
                   (v_item.p_cat ILIKE '%Luz%' AND v_rel.sug_cat ILIKE '%Lente%') THEN
                    v_ignored_count := v_ignored_count + 1;
                    CONTINUE;
                END IF;

                -- Mapeamento de tipos e prioridades
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

                v_motivo := format('Cliente adquiriu %s no orçamento %s. Sugerimos %s (%s) para complementar seu setup.', 
                    v_item.p_name, COALESCE(v_quote.quote_number, v_quote.id::text), v_rel.sug_name, v_tipo_val);

                -- Inserir oportunidade se não existir (Evitar duplicidade)
                IF NOT EXISTS (
                    SELECT 1 FROM public.smart_opportunities 
                    WHERE quote_id = v_quote.id 
                    AND produto_base = v_item.p_id 
                    AND produto_sugerido = v_rel.related_product_id
                ) THEN
                    INSERT INTO public.smart_opportunities (
                        quote_id,
                        cliente_id,
                        vendedor_id,
                        company_id,
                        produto_base,
                        produto_sugerido,
                        tipo_oportunidade,
                        motivo,
                        prioridade,
                        status
                    ) VALUES (
                        v_quote.id,
                        v_quote.client_id,
                        v_quote.salesperson_id,
                        COALESCE(v_quote.company_id, v_company_id),
                        v_item.p_id,
                        v_rel.related_product_id,
                        v_tipo_val,
                        v_motivo,
                        v_prioridade_val,
                        'Nova'
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
        'invalid_seller_count', v_invalid_seller_count,
        'invalid_client_count', v_invalid_client_count,
        'no_relation_count', v_no_relation_count
    );
END;
$$;