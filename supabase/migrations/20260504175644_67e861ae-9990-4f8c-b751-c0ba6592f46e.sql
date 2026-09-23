-- 1. Limpar oportunidades antigas e orfãs
DELETE FROM public.smart_opportunities;

-- 2. Garantir que as colunas necessárias existam (já verificado que existem, mas por segurança)
-- cliente_id, vendedor_id, produto_base, produto_sugerido, quote_id

-- 3. Função melhorada para geração de oportunidades
CREATE OR REPLACE FUNCTION public.process_approved_quotes_v2()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    quote_record RECORD;
    item_record RECORD;
    rel_record RECORD;
    opp_count integer := 0;
    motivo_texto text;
    prioridade_val text;
    tipo_oport_val text;
BEGIN
    -- Loop por todos os orçamentos aprovados que ainda não foram processados ou para re-processar
    -- Para simplificar e garantir dados reais, buscamos orçamentos aprovados/entregues/faturados
    FOR quote_record IN 
        SELECT id, client_id, salesperson_id, client_name
        FROM public.quotes 
        WHERE status IN ('Aprovado', 'Entregue', 'Faturado')
    LOOP
        -- Loop pelos itens do orçamento
        FOR item_record IN 
            SELECT qi.product_code, p.id as p_id, p.name as p_name, p.category_principal, p.level
            FROM public.quote_items qi
            JOIN public.products p ON (p.code = qi.product_code OR p.id::text = qi.product_code)
            WHERE qi.quote_id = quote_record.id
        LOOP
            -- Buscar relacionamentos reais e compatíveis
            FOR rel_record IN 
                SELECT 
                    pr.related_product_id, 
                    pr.tipo_relacao, 
                    pr.observacao,
                    p_sug.name as sug_name,
                    p_sug.category_principal as sug_cat,
                    p_sug.level as sug_level
                FROM public.product_relationships pr
                JOIN public.products p_sug ON pr.related_product_id = p_sug.id
                WHERE pr.product_id = item_record.p_id
            LOOP
                -- REGRAS DE COMPATIBILIDADE E QUALIDADE
                
                -- 1. Não sugerir produto de nível inferior (downgrade)
                -- Simples: se base é 'profissional' e sugestão é 'entrada', ignorar.
                IF item_record.level = 'profissional' AND rel_record.sug_level = 'entrada' THEN
                    CONTINUE;
                END IF;

                -- 2. Validação de categoria (Exemplo: Lente não sugere Luz se não for acessório direto)
                -- Aqui usamos a matriz de compatibilidade do prompt
                IF item_record.category_principal ILIKE '%Lente%' AND rel_record.sug_cat ILIKE '%Luz%' THEN
                    CONTINUE; -- Lente não sugere Luz
                END IF;

                -- 3. Definir tipo e prioridade
                tipo_oport_val := CASE 
                    WHEN rel_record.tipo_relacao = 'upsell' THEN 'Upsell'
                    WHEN rel_record.tipo_relacao = 'acessorio' THEN 'Acessório recomendado'
                    ELSE 'Cross-sell'
                END;
                
                prioridade_val := CASE 
                    WHEN rel_record.tipo_relacao = 'upsell' THEN 'alta'
                    WHEN rel_record.tipo_relacao = 'acessorio' THEN 'média'
                    ELSE 'baixa'
                END;

                -- 4. Construir motivo completo
                motivo_texto := format('Cliente adquiriu %s. Sugestão de %s (%s) para complementar e elevar o nível do setup técnico.', 
                    item_record.p_name, 
                    rel_record.sug_name, 
                    rel_record.sug_cat
                );
                
                IF rel_record.observacao IS NOT NULL AND rel_record.observacao <> '' THEN
                    motivo_texto := motivo_texto || ' ' || rel_record.observacao;
                END IF;

                -- 5. Inserir se não existir duplicata (mesmo cliente, mesmo produto sugerido, mesmo orçamento)
                IF NOT EXISTS (
                    SELECT 1 FROM public.smart_opportunities 
                    WHERE cliente_id = quote_record.client_id 
                    AND produto_sugerido = rel_record.related_product_id
                    AND quote_id = quote_record.id
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
                        status
                    ) VALUES (
                        quote_record.client_id,
                        quote_record.salesperson_id,
                        item_record.p_id,
                        rel_record.related_product_id,
                        quote_record.id,
                        tipo_oport_val,
                        motivo_texto,
                        prioridade_val,
                        'Nova'
                    );
                    opp_count := opp_count + 1;
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;
    
    RETURN opp_count;
END;
$$;
