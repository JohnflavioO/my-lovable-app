
-- 1. New columns on logistics_records
ALTER TABLE public.logistics_records
  ADD COLUMN IF NOT EXISTS tracking_url TEXT,
  ADD COLUMN IF NOT EXISTS public_token TEXT,
  ADD COLUMN IF NOT EXISTS is_incompleto BOOLEAN NOT NULL DEFAULT false;

-- Backfill tokens for existing rows
UPDATE public.logistics_records
SET public_token = encode(gen_random_bytes(16), 'hex')
WHERE public_token IS NULL;

ALTER TABLE public.logistics_records
  ALTER COLUMN public_token SET DEFAULT encode(gen_random_bytes(16), 'hex'),
  ALTER COLUMN public_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS logistics_records_public_token_key
  ON public.logistics_records(public_token);

-- 2. Item status table
CREATE TABLE IF NOT EXISTS public.logistics_item_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  logistics_record_id UUID NOT NULL REFERENCES public.logistics_records(id) ON DELETE CASCADE,
  quote_item_id UUID NOT NULL REFERENCES public.quote_items(id) ON DELETE CASCADE,
  item_status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (item_status IN ('pendente','faturado','enviado','entregue')),
  updated_by UUID,
  updated_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (logistics_record_id, quote_item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.logistics_item_status TO authenticated;
GRANT SELECT ON public.logistics_item_status TO anon;
GRANT ALL ON public.logistics_item_status TO service_role;

ALTER TABLE public.logistics_item_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Logistica/Gestor/Admin manage item status"
  ON public.logistics_item_status FOR ALL
  TO authenticated
  USING (is_logistica() OR is_gestor() OR is_admin())
  WITH CHECK (is_logistica() OR is_gestor() OR is_admin());

CREATE POLICY "Quote owner views item status"
  ON public.logistics_item_status FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.logistics_records lr
    WHERE lr.id = logistics_item_status.logistics_record_id
      AND is_quote_owner(lr.quote_id)
  ));

CREATE POLICY "Public token views item status"
  ON public.logistics_item_status FOR SELECT
  TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.logistics_records lr
    WHERE lr.id = logistics_item_status.logistics_record_id
      AND lr.public_token = public.get_public_quote_token()
  ));

CREATE TRIGGER set_logistics_item_status_updated_at
  BEFORE UPDATE ON public.logistics_item_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Trigger to recompute is_incompleto on logistics_records
CREATE OR REPLACE FUNCTION public.recompute_logistics_incompleto()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_record_id UUID;
  v_has_pending BOOLEAN;
BEGIN
  v_record_id := COALESCE(NEW.logistics_record_id, OLD.logistics_record_id);

  SELECT EXISTS (
    SELECT 1 FROM public.logistics_item_status
    WHERE logistics_record_id = v_record_id
      AND item_status <> 'entregue'
  ) INTO v_has_pending;

  UPDATE public.logistics_records
  SET is_incompleto = v_has_pending,
      updated_at = now()
  WHERE id = v_record_id;

  -- Log to action history
  INSERT INTO public.logistics_action_history (
    logistics_record_id, action_type, previous_status, new_status, notes, performed_by, performed_by_name
  ) VALUES (
    v_record_id,
    'item_status_change',
    COALESCE(OLD.item_status, NULL),
    COALESCE(NEW.item_status, 'removido'),
    'Status do item alterado',
    COALESCE(auth.uid(), NEW.updated_by),
    COALESCE(NEW.updated_by_name, '')
  );

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_recompute_logistics_incompleto ON public.logistics_item_status;
CREATE TRIGGER trg_recompute_logistics_incompleto
  AFTER INSERT OR UPDATE OR DELETE ON public.logistics_item_status
  FOR EACH ROW EXECUTE FUNCTION public.recompute_logistics_incompleto();

-- 4. Public read access to logistics_records via x-quote-token header
CREATE POLICY "Public token views logistics record"
  ON public.logistics_records FOR SELECT
  TO anon, authenticated
  USING (public_token IS NOT NULL AND public_token = public.get_public_quote_token());

-- 5. Public read access to quotes (minimal fields) via the same token
CREATE POLICY "Public token views quote via logistics"
  ON public.quotes FOR SELECT
  TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.logistics_records lr
    WHERE lr.quote_id = quotes.id
      AND lr.public_token = public.get_public_quote_token()
  ));

-- 6. Public read access to quote_items via the same token
CREATE POLICY "Public token views quote items via logistics"
  ON public.quote_items FOR SELECT
  TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.logistics_records lr
    WHERE lr.quote_id = quote_items.quote_id
      AND lr.public_token = public.get_public_quote_token()
  ));

-- 7. Public read access to logistics_action_history via the same token
CREATE POLICY "Public token views logistics history"
  ON public.logistics_action_history FOR SELECT
  TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.logistics_records lr
    WHERE lr.id = logistics_action_history.logistics_record_id
      AND lr.public_token = public.get_public_quote_token()
  ));
