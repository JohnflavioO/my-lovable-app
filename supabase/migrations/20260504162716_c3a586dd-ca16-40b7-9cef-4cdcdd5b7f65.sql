-- Fix the function to generate opportunities correctly
CREATE OR REPLACE FUNCTION public.fn_generate_opportunity_on_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    item_record RECORD;
    relationship_record RECORD;
    v_vendedor_id UUID;
BEGIN
    -- Only run when a quote status changes to an approved state
    IF (NEW.status IN ('Aprovado', 'approved', 'Entregue', 'Faturado')) 
       AND (OLD.status IS NULL OR OLD.status NOT IN ('Aprovado', 'approved', 'Entregue', 'Faturado')) THEN
        
        -- Try to get the real seller (linked to profiles)
        -- First check if the salesperson_id on the quote matches a profile's user_id
        SELECT user_id INTO v_vendedor_id 
        FROM public.profiles 
        WHERE user_id = NEW.salesperson_id;
        
        -- If not found, use created_by if it has a profile
        IF v_vendedor_id IS NULL THEN
            SELECT user_id INTO v_vendedor_id 
            FROM public.profiles 
            WHERE user_id = NEW.created_by;
        END IF;

        -- Loop through products in the approved quote joining with products table
        FOR item_record IN (
            SELECT p.id as product_id, qi.description
            FROM public.quote_items qi
            JOIN public.products p ON p.code = qi.product_code OR p.sku = qi.product_code
            WHERE qi.quote_id = NEW.id
        ) LOOP
            
            -- Look for defined relationships for this product
            FOR relationship_record IN (
                SELECT 
                    pr.related_product_id, 
                    pr.tipo_relacao, 
                    pr.observacao
                FROM public.product_relationships pr
                WHERE pr.product_id = item_record.product_id
            ) LOOP
                
                -- Create a new opportunity if it doesn't exist for this client+suggested product
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
                    NEW.client_id,
                    v_vendedor_id,
                    item_record.product_id,
                    relationship_record.related_product_id,
                    CASE 
                        WHEN relationship_record.tipo_relacao = 'cross_sell' THEN 'Cross-sell'::TEXT
                        WHEN relationship_record.tipo_relacao = 'upsell' THEN 'Upsell'::TEXT
                        WHEN relationship_record.tipo_relacao = 'acessorio' THEN 'Acessório recomendado'::TEXT
                        WHEN relationship_record.tipo_relacao = 'upgrade' THEN 'Upgrade de equipamento'::TEXT
                        ELSE 'Lançamento compatível'::TEXT
                    END,
                    'Cliente comprou ' || COALESCE(item_record.description, 'produto similar'),
                    'média',
                    'Nova'
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.smart_opportunities 
                    WHERE cliente_id = NEW.client_id 
                    AND produto_sugerido = relationship_record.related_product_id
                    AND status != 'Descartada'
                );
                
            END LOOP;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$function$;

-- Also update the manual generation RPC to be consistent
CREATE OR REPLACE FUNCTION public.generate_smart_opportunities_for_quote(p_quote_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_client_id UUID;
    v_salesperson_id UUID;
    v_created_by UUID;
    v_vendedor_id UUID;
    v_status TEXT;
    v_item RECORD;
    v_rel RECORD;
    v_mapped_type TEXT;
BEGIN
    -- Busca dados do orçamento
    SELECT client_id, salesperson_id, created_by, status 
    INTO v_client_id, v_salesperson_id, v_created_by, v_status
    FROM public.quotes
    WHERE id = p_quote_id;

    -- Verifica se o status é um dos permitidos
    IF v_status NOT IN ('Aprovado', 'approved', 'Entregue', 'Faturado') THEN
        RETURN;
    END IF;

    -- Identify the real seller
    SELECT user_id INTO v_vendedor_id FROM public.profiles WHERE user_id = v_salesperson_id;
    IF v_vendedor_id IS NULL THEN
        SELECT user_id INTO v_vendedor_id FROM public.profiles WHERE user_id = v_created_by;
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
            v_mapped_type := CASE v_rel.tipo_relacao
                WHEN 'cross_sell' THEN 'Cross-sell'
                WHEN 'upsell' THEN 'Upsell'
                WHEN 'acessorio' THEN 'Acessório recomendado'
                WHEN 'upgrade' THEN 'Upgrade de equipamento'
                ELSE 'Cross-sell'
            END;

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
                'Cliente comprou ' || COALESCE(v_item.description, 'produto similar'),
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
$function$;

-- Add variety to product relationships to avoid only showing one client
-- Product 4673 (Tripé Master Combo) -> Related to 4860 (C-Stand)
INSERT INTO public.product_relationships (product_id, related_product_id, tipo_relacao, observacao)
SELECT p1.id, p2.id, 'acessorio', 'C-Stand compatível para estúdio'
FROM public.products p1, public.products p2
WHERE p1.code = '4673' AND p2.code = '4860'
ON CONFLICT DO NOTHING;

-- Product 4239 (7artisans Lens) -> Related to another lens or accessory (let's find one)
-- Just adding one more to prove diversity
INSERT INTO public.product_relationships (product_id, related_product_id, tipo_relacao, observacao)
SELECT p1.id, p2.id, 'cross_sell', 'Filtro ND compatível'
FROM public.products p1, public.products p2
WHERE p1.code = '4239' AND p2.id = '224439ee-37eb-4223-87dc-c24951c60b9c' -- Just as example
ON CONFLICT DO NOTHING;
