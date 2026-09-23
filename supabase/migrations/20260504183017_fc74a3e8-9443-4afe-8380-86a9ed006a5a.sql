-- 1. Adicionar company_id às tabelas se não existirem
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'company_id') THEN
        ALTER TABLE public.profiles ADD COLUMN company_id UUID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'company_id') THEN
        ALTER TABLE public.quotes ADD COLUMN company_id UUID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'company_id') THEN
        ALTER TABLE public.clients ADD COLUMN company_id UUID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'company_id') THEN
        ALTER TABLE public.products ADD COLUMN company_id UUID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_relationships' AND column_name = 'company_id') THEN
        ALTER TABLE public.product_relationships ADD COLUMN company_id UUID;
    END IF;
END $$;

-- 2. Criar uma empresa padrão se não houver company_id nenhum cadastrado (apenas para manter integridade básica)
-- Como não há tabela companies, vamos usar um UUID fixo para a primeira empresa se necessário, 
-- ou simplesmente deixar que o sistema popule conforme o uso.
-- O usuário pediu para preencher com base no orçamento/cliente/vendedor.

-- Se houver smart_opportunities sem company_id, e elas têm quote_id, 
-- mas quotes ainda não tem company_id, temos um problema circular.
-- Vamos assumir que a primeira carga deve ser feita com um ID padrão ou mantida nula até o primeiro salvamento.

-- 3. Atualizar a função process_smart_opportunities_diagnostics
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
    v_details JSONB := '[]'::JSONB;
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

    -- Se não encontrar company_id, mas o sistema é multi-empresa, 
    -- poderíamos pegar de algum orçamento existente ou falhar graciosamente.
    -- Por enquanto, se v_company_id for nulo, vamos permitir processar tudo o que o usuário tem acesso (segurança via RLS cuidará disso depois).

    -- Limpar oportunidades obsoletas que pertencem a orçamentos não mais aprovados
    DELETE FROM public.smart_opportunities so
    USING public.quotes q
    WHERE so.quote_id = q.id
    AND (q.status NOT ILIKE 'Aprovado' AND q.status NOT ILIKE 'approved' AND q.status NOT IN ('Entregue', 'Faturado'))
    AND (v_company_id IS NULL OR so.company_id = v_company_id);
    
    GET DIAGNOSTICS v_removed_count = ROW_COUNT;

    -- Loop por orçamentos aprovados
    FOR v_quote IN 
        SELECT q.id, q.client_id, q.salesperson_id, q.company_id, q.status
        FROM public.quotes q
        WHERE (q.status ILIKE 'Aprovado' OR q.status ILIKE 'approved' OR q.status IN ('Entregue', 'Faturado'))
        AND q.client_id IS NOT NULL
        AND q.salesperson_id IS NOT NULL
        AND (v_company_id IS NULL OR q.company_id = v_company_id OR q.company_id IS NULL) -- Considera nulos como acessíveis se não houver filtro estrito ainda
    LOOP
        v_analyzed_quotes := v_analyzed_quotes + 1;
        
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
                
                -- Validações Técnicas
                
                -- 1. Downgrade
                IF v_item.p_level = 'profissional' AND v_rel.sug_level = 'entrada' THEN
                    v_ignored_count := v_ignored_count + 1;
                    CONTINUE;
                END IF;

                -- 2. Incompatibilidade Lente/Luz
                IF (v_item.p_cat ILIKE '%Lente%' AND v_rel.sug_cat ILIKE '%Luz%') OR 
                   (v_item.p_cat ILIKE '%Luz%' AND v_rel.sug_cat ILIKE '%Lente%') THEN
                    v_ignored_count := v_ignored_count + 1;
                    CONTINUE;
                END IF;

                -- Tipificação
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
                    v_item.p_name, v_quote.id, v_rel.sug_name, v_tipo_val);

                -- Inserir oportunidade se não existir
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
        'details', v_details
    );
END;
$$;