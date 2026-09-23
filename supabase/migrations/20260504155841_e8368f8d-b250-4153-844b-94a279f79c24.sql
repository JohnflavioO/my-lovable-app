-- Function to generate smart opportunities
CREATE OR REPLACE FUNCTION public.fn_generate_opportunity_on_approval()
RETURNS TRIGGER AS $$
DECLARE
    item_record RECORD;
    relationship_record RECORD;
BEGIN
    -- Only run when a quote status changes to 'approved'
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
        
        -- Loop through products in the approved quote
        FOR item_record IN (SELECT product_id FROM public.quote_items WHERE quote_id = NEW.id) LOOP
            
            -- Look for defined relationships for this product
            FOR relationship_record IN (
                SELECT 
                    pr.related_product_id, 
                    pr.tipo_relacao, 
                    pr.observacao,
                    p.name as suggested_name
                FROM public.product_relationships pr
                JOIN public.products p ON p.id = pr.related_product_id
                WHERE pr.product_id = item_record.product_id
            ) LOOP
                
                -- Create a new opportunity
                INSERT INTO public.smart_opportunities (
                    cliente_id,
                    vendedor_id,
                    produto_base,
                    produto_sugerido,
                    tipo_oportunidade,
                    motivo,
                    prioridade,
                    status
                ) VALUES (
                    NEW.client_id,
                    NEW.created_by, -- Assuming the creator of the quote is the seller
                    item_record.product_id,
                    relationship_record.related_product_id,
                    CASE 
                        WHEN relationship_record.tipo_relacao = 'cross_sell' THEN 'Cross-sell'::TEXT
                        WHEN relationship_record.tipo_relacao = 'upsell' THEN 'Upsell'::TEXT
                        WHEN relationship_record.tipo_relacao = 'acessorio' THEN 'Acessório recomendado'::TEXT
                        WHEN relationship_record.tipo_relacao = 'upgrade' THEN 'Upgrade de equipamento'::TEXT
                        ELSE 'Lançamento compatível'::TEXT
                    END,
                    COALESCE(relationship_record.observacao, 'Sugestão baseada na compra de ' || (SELECT name FROM products WHERE id = item_record.product_id)),
                    'média',
                    'Nova'
                );
                
            END LOOP;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger on quotes table
DROP TRIGGER IF EXISTS tr_generate_opportunity_on_quote_approval ON public.quotes;
CREATE TRIGGER tr_generate_opportunity_on_quote_approval
AFTER UPDATE ON public.quotes
FOR EACH ROW
EXECUTE FUNCTION public.fn_generate_opportunity_on_approval();
