-- 1) Novos campos na tabela de cotações de frete
ALTER TABLE public.quote_freight_quotes
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS modalidade text,
  ADD COLUMN IF NOT EXISTS api_provider text,
  ADD COLUMN IF NOT EXISTS payload_request jsonb,
  ADD COLUMN IF NOT EXISTS payload_response jsonb,
  ADD COLUMN IF NOT EXISTS is_selected boolean NOT NULL DEFAULT false;

-- Índice único parcial: apenas uma cotação selecionada por orçamento
CREATE UNIQUE INDEX IF NOT EXISTS uniq_qfq_selected_per_quote
  ON public.quote_freight_quotes(quote_id)
  WHERE is_selected = true;

CREATE INDEX IF NOT EXISTS idx_qfq_company_id
  ON public.quote_freight_quotes(company_id);

-- 2) Trigger: preencher company_id e created_by automaticamente no insert
CREATE OR REPLACE FUNCTION public.set_qfq_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.current_user_company_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qfq_set_defaults ON public.quote_freight_quotes;
CREATE TRIGGER trg_qfq_set_defaults
  BEFORE INSERT ON public.quote_freight_quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_qfq_defaults();

-- 3) Trigger: quando uma cotação é marcada como is_selected=true,
--    desmarca as outras do mesmo orçamento e sincroniza os campos
--    shipping_cost / shipping_method / shipping_deadline em quotes.
CREATE OR REPLACE FUNCTION public.sync_selected_freight_quote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_selected = true THEN
    -- desmarcar outras cotações do mesmo orçamento
    UPDATE public.quote_freight_quotes
      SET is_selected = false, updated_at = now()
      WHERE quote_id = NEW.quote_id
        AND id <> NEW.id
        AND is_selected = true;

    -- refletir escolha no orçamento
    UPDATE public.quotes
      SET shipping_cost     = COALESCE(NEW.valor_frete, shipping_cost),
          shipping_method   = COALESCE(NEW.carrier, shipping_method),
          shipping_deadline = COALESCE(
            CASE WHEN NEW.prazo_dias IS NOT NULL
                 THEN NEW.prazo_dias::text || ' dias úteis'
                 ELSE NULL END,
            shipping_deadline
          ),
          updated_at = now()
      WHERE id = NEW.quote_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qfq_sync_selected ON public.quote_freight_quotes;
CREATE TRIGGER trg_qfq_sync_selected
  AFTER INSERT OR UPDATE OF is_selected ON public.quote_freight_quotes
  FOR EACH ROW EXECUTE FUNCTION public.sync_selected_freight_quote();