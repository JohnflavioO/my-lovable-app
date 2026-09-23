-- Add new columns to products for intelligent categorization
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS category_principal TEXT,
ADD COLUMN IF NOT EXISTS level TEXT CHECK (level IN ('entrada', 'intermediário', 'profissional')),
ADD COLUMN IF NOT EXISTS compatibility TEXT;

-- Add quote_id to smart_opportunities for direct linking
ALTER TABLE public.smart_opportunities 
ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES public.quotes(id) ON DELETE CASCADE;

-- Update the opportunity generation function with intelligent logic
CREATE OR REPLACE FUNCTION public.fn_generate_opportunity_on_approval()
RETURNS TRIGGER AS $$
DECLARE
    item_record RECORD;
    relationship_record RECORD;
    v_vendedor_id UUID;
    v_base_product_name TEXT;
    v_base_product_category TEXT;
    v_base_product_level TEXT;
    v_suggested_product_level TEXT;
    v_suggested_product_category TEXT;
    v_motivo TEXT;
BEGIN
    -- Only run when a quote status changes to an approved state
    IF (NEW.status IN ('Aprovado', 'approved', 'Entregue', 'Faturado')) 
       AND (OLD.status IS NULL OR OLD.status NOT IN ('Aprovado', 'approved', 'Entregue', 'Faturado')) THEN
        
        -- Validate mandatory data
        IF NEW.client_id IS NULL THEN
            RETURN NEW;
        END IF;

        -- Try to get the real seller (linked to profiles)
        SELECT user_id INTO v_vendedor_id 
        FROM public.profiles 
        WHERE user_id = NEW.salesperson_id;
        
        -- If not found, use created_by if it has a profile
        IF v_vendedor_id IS NULL THEN
            SELECT user_id INTO v_vendedor_id 
            FROM public.profiles 
            WHERE user_id = NEW.created_by;
        END IF;

        -- Loop through products in the approved quote
        FOR item_record IN (
            SELECT p.id as product_id, p.name as product_name, p.category_principal, p.level as product_level, qi.description
            FROM public.quote_items qi
            JOIN public.products p ON p.code = qi.product_code OR p.sku = qi.product_code
            WHERE qi.quote_id = NEW.id
        ) LOOP
            
            v_base_product_name := item_record.product_name;
            v_base_product_category := item_record.category_principal;
            v_base_product_level := item_record.product_level;

            -- Look for defined relationships for this product
            FOR relationship_record IN (
                SELECT 
                    pr.related_product_id, 
                    pr.tipo_relacao,
                    p_sug.name as suggested_name,
                    p_sug.category_principal as suggested_category,
                    p_sug.level as suggested_level
                FROM public.product_relationships pr
                JOIN public.products p_sug ON p_sug.id = pr.related_product_id
                WHERE pr.product_id = item_record.product_id
            ) LOOP
                
                v_suggested_product_level := relationship_record.suggested_level;
                v_suggested_product_category := relationship_record.suggested_category;

                -- INTELLIGENT FILTERING
                
                -- 1. UPSELL RULE: Only suggest equal or superior level
                IF relationship_record.tipo_relacao IN ('upsell', 'upgrade') THEN
                    IF v_base_product_level = 'profissional' AND v_suggested_product_level != 'profissional' THEN
                        CONTINUE; -- Skip if suggesting non-pro for pro
                    ELSIF v_base_product_level = 'intermediário' AND v_suggested_product_level = 'entrada' THEN
                        CONTINUE; -- Skip if suggesting entry for intermediate
                    END IF;
                END IF;

                -- 2. CROSS-SELL RULE: Ensure it complements (usually different category or marked as accessory)
                IF relationship_record.tipo_relacao = 'cross_sell' AND v_base_product_category = v_suggested_product_category THEN
                    CONTINUE; -- Avoid suggesting same category for cross-sell (unless it's accessories)
                END IF;

                -- 3. BLOCK SAME TYPE EXCLUSION: Don't suggest the same product as base
                IF item_record.product_id = relationship_record.related_product_id THEN
                    CONTINUE;
                END IF;

                -- CONSTRUCT INTELLIGENT REASON TEXT
                CASE 
                    WHEN v_base_product_category = 'iluminação' AND relationship_record.tipo_relacao = 'cross_sell' THEN
                        v_motivo := 'Cliente comprou ' || v_base_product_name || ' e pode melhorar a qualidade com ' || relationship_record.suggested_name;
                    WHEN v_base_product_category = 'lente' AND relationship_record.tipo_relacao = 'cross_sell' THEN
                        v_motivo := 'Cliente comprou lente e pode expandir setup com ' || relationship_record.suggested_name;
                    WHEN relationship_record.tipo_relacao IN ('upsell', 'upgrade') THEN
                        v_motivo := 'Cliente pode evoluir setup com equipamento superior: ' || relationship_record.suggested_name;
                    ELSE
                        v_motivo := 'Sugestão complementar para ' || v_base_product_name || ': ' || relationship_record.suggested_name;
                END CASE;

                -- Create a new opportunity
                INSERT INTO public.smart_opportunities (
                    quote_id,
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
                    NEW.id,
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
                    v_motivo,
                    CASE 
                        WHEN v_suggested_product_level = 'profissional' THEN 'alta'
                        ELSE 'média'
                    END,
                    'Nova'
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.smart_opportunities 
                    WHERE cliente_id = NEW.client_id 
                    AND produto_sugerido = relationship_record.related_product_id
                    AND status != 'Descartada'
                    AND (quote_id = NEW.id OR created_at > now() - interval '30 days')
                );
                
            END LOOP;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
