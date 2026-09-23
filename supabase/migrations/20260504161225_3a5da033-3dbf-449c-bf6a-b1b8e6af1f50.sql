-- Função para gerar oportunidades para um orçamento específico
CREATE OR REPLACE FUNCTION public.generate_smart_opportunities_for_quote(p_quote_id UUID)
RETURNS void AS $$
DECLARE
    v_client_id UUID;
    v_vendedor_id UUID;
    v_status TEXT;
    v_item RECORD;
    v_rel RECORD;
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
        SELECT COALESCE(p.id, NULL) as product_id, qi.description
        FROM public.quote_items qi
        LEFT JOIN public.products p ON p.code = qi.product_code OR p.sku = qi.product_code
        WHERE qi.quote_id = p_quote_id
    ) LOOP
        -- Se encontramos o produto no cadastro
        IF v_item.product_id IS NOT NULL THEN
            -- Busca produtos relacionados
            FOR v_rel IN (
                SELECT related_product_id, tipo_relacao, observacao
                FROM public.product_relationships
                WHERE product_id = v_item.product_id
            ) LOOP
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
                    v_rel.tipo_relacao,
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
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para gerar oportunidades automaticamente ao aprovar orçamento
CREATE OR REPLACE FUNCTION public.on_quote_status_change_generate_opportunities()
RETURNS TRIGGER AS $$
BEGIN
    -- Se o status mudou para um dos que geram oportunidade
    IF (NEW.status IN ('Aprovado', 'Entregue', 'Faturado')) AND 
       (OLD.status IS NULL OR OLD.status NOT IN ('Aprovado', 'Entregue', 'Faturado')) THEN
        PERFORM public.generate_smart_opportunities_for_quote(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_generate_opportunities ON public.quotes;
CREATE TRIGGER trigger_generate_opportunities
AFTER UPDATE OF status ON public.quotes
FOR EACH ROW
EXECUTE FUNCTION public.on_quote_status_change_generate_opportunities();

-- Função para processar todos os orçamentos aprovados (Manual/Rotina)
CREATE OR REPLACE FUNCTION public.process_all_approved_quotes_opportunities()
RETURNS integer AS $$
DECLARE
    v_quote RECORD;
    v_count integer := 0;
BEGIN
    FOR v_quote IN (
        SELECT id FROM public.quotes 
        WHERE status IN ('Aprovado', 'Entregue', 'Faturado')
    ) LOOP
        PERFORM public.generate_smart_opportunities_for_quote(v_quote.id);
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
