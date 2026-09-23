CREATE TABLE IF NOT EXISTS public.quote_payment_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid,
  user_id uuid,
  action text NOT NULL,
  attempted_status text,
  error_code text,
  missing_fields text[],
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.quote_payment_audit TO authenticated;
GRANT ALL ON public.quote_payment_audit TO service_role;
ALTER TABLE public.quote_payment_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qpa_insert_authenticated" ON public.quote_payment_audit;
CREATE POLICY "qpa_insert_authenticated" ON public.quote_payment_audit
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "qpa_select_own_or_admin" ON public.quote_payment_audit;
CREATE POLICY "qpa_select_own_or_admin" ON public.quote_payment_audit
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin() OR public.is_gestor());

CREATE INDEX IF NOT EXISTS idx_qpa_quote ON public.quote_payment_audit(quote_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.quote_payment_problem(q public.quotes)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  valid_methods text[] := ARRAY['pix','cartao','boleto'];
  m1 text; m2 text; v1 numeric; v2 numeric; total numeric;
BEGIN
  total := COALESCE(q.total_amount, 0);

  IF COALESCE(q.is_split_payment, false) THEN
    m1 := lower(trim(COALESCE(q.split_method_1, '')));
    m2 := lower(trim(COALESCE(q.split_method_2, '')));
    IF NOT (m1 = ANY(valid_methods)) THEN
      RETURN 'PAYMENT_METHOD_REQUIRED|Selecione o método 1 do pagamento dividido.|split_method_1';
    END IF;
    IF NOT (m2 = ANY(valid_methods)) THEN
      RETURN 'PAYMENT_METHOD_REQUIRED|Selecione o método 2 do pagamento dividido.|split_method_2';
    END IF;
    IF m1 = m2 THEN
      RETURN 'PAYMENT_TERMS_INCOMPLETE|Os dois métodos de pagamento não podem ser iguais.|split_method_1,split_method_2';
    END IF;
    v1 := COALESCE(q.split_value_1, 0);
    v2 := COALESCE(q.split_value_2, 0);
    IF v1 <= 0 THEN RETURN 'PAYMENT_TERMS_INCOMPLETE|Informe o valor do método 1.|split_value_1'; END IF;
    IF v2 <= 0 THEN RETURN 'PAYMENT_TERMS_INCOMPLETE|Informe o valor do método 2.|split_value_2'; END IF;
    IF total > 0 AND abs((v1 + v2) - total) > 0.01 THEN
      RETURN 'PAYMENT_TERMS_INCOMPLETE|A soma dos valores dos dois métodos deve ser igual ao total do orçamento.|split_value_1,split_value_2';
    END IF;
    IF m1 = 'pix' AND q.split_date_1 IS NULL THEN
      RETURN 'PAYMENT_TERMS_INCOMPLETE|Informe a data do pagamento PIX (método 1).|split_date_1';
    END IF;
    IF m1 = 'boleto' AND (q.split_date_1 IS NULL OR COALESCE(q.split_installments_1,0) < 1) THEN
      RETURN 'PAYMENT_TERMS_INCOMPLETE|Informe parcelas e vencimento inicial do boleto (método 1).|split_installments_1,split_date_1';
    END IF;
    IF m1 = 'cartao' AND (COALESCE(q.split_installments_1,0) < 1 OR q.split_installments_1 > 10) THEN
      RETURN 'PAYMENT_TERMS_INCOMPLETE|Cartão permite de 1 a 10 parcelas (método 1).|split_installments_1';
    END IF;
    IF m2 = 'pix' AND q.split_date_2 IS NULL THEN
      RETURN 'PAYMENT_TERMS_INCOMPLETE|Informe a data do pagamento PIX (método 2).|split_date_2';
    END IF;
    IF m2 = 'boleto' AND (q.split_date_2 IS NULL OR COALESCE(q.split_installments_2,0) < 1) THEN
      RETURN 'PAYMENT_TERMS_INCOMPLETE|Informe parcelas e vencimento inicial do boleto (método 2).|split_installments_2,split_date_2';
    END IF;
    IF m2 = 'cartao' AND (COALESCE(q.split_installments_2,0) < 1 OR q.split_installments_2 > 10) THEN
      RETURN 'PAYMENT_TERMS_INCOMPLETE|Cartão permite de 1 a 10 parcelas (método 2).|split_installments_2';
    END IF;
    RETURN NULL;
  END IF;

  m1 := lower(trim(COALESCE(q.payment_method, '')));
  IF NOT (m1 = ANY(valid_methods)) THEN
    RETURN 'PAYMENT_METHOD_REQUIRED|Informe uma forma de pagamento para continuar.|payment_method';
  END IF;
  IF m1 = 'pix' AND q.payment_date IS NULL THEN
    RETURN 'PAYMENT_TERMS_INCOMPLETE|Informe a data do pagamento PIX.|payment_date';
  END IF;
  IF m1 = 'boleto' AND (q.payment_date IS NULL OR COALESCE(q.installments,0) < 1) THEN
    RETURN 'PAYMENT_TERMS_INCOMPLETE|Informe parcelas e vencimento inicial do boleto.|installments,payment_date';
  END IF;
  IF m1 = 'cartao' AND (COALESCE(q.installments,0) < 1 OR q.installments > 10) THEN
    RETURN 'PAYMENT_TERMS_INCOMPLETE|Cartão de crédito permite de 1 a 10 parcelas.|installments';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_quote_payment_completeness()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  problem text;
  parts text[];
  payment_changed boolean := false;
BEGIN
  IF COALESCE(NEW.status, 'draft') IN ('draft', 'rejected') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    payment_changed :=
      NEW.payment_method IS DISTINCT FROM OLD.payment_method
      OR NEW.payment_date IS DISTINCT FROM OLD.payment_date
      OR NEW.installments IS DISTINCT FROM OLD.installments
      OR NEW.is_split_payment IS DISTINCT FROM OLD.is_split_payment
      OR NEW.split_method_1 IS DISTINCT FROM OLD.split_method_1
      OR NEW.split_method_2 IS DISTINCT FROM OLD.split_method_2
      OR NEW.split_value_1 IS DISTINCT FROM OLD.split_value_1
      OR NEW.split_value_2 IS DISTINCT FROM OLD.split_value_2
      OR NEW.split_date_1 IS DISTINCT FROM OLD.split_date_1
      OR NEW.split_date_2 IS DISTINCT FROM OLD.split_date_2
      OR NEW.split_installments_1 IS DISTINCT FROM OLD.split_installments_1
      OR NEW.split_installments_2 IS DISTINCT FROM OLD.split_installments_2;

    IF NEW.status IS NOT DISTINCT FROM OLD.status AND NOT payment_changed THEN
      RETURN NEW;
    END IF;
  END IF;

  problem := public.quote_payment_problem(NEW);
  IF problem IS NULL THEN
    RETURN NEW;
  END IF;

  parts := string_to_array(problem, '|');
  RAISE EXCEPTION '%: % (campos: %)', parts[1], parts[2], parts[3]
    USING ERRCODE = 'check_violation',
          HINT = 'Salve como Rascunho ou complete a forma de pagamento.';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_quote_payment ON public.quotes;
CREATE TRIGGER trg_enforce_quote_payment
  BEFORE INSERT OR UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_quote_payment_completeness();

CREATE OR REPLACE FUNCTION public.log_quote_payment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_method IS DISTINCT FROM OLD.payment_method
     OR NEW.is_split_payment IS DISTINCT FROM OLD.is_split_payment
     OR NEW.installments IS DISTINCT FROM OLD.installments
     OR NEW.payment_date IS DISTINCT FROM OLD.payment_date THEN
    INSERT INTO public.quote_payment_audit (quote_id, user_id, action, attempted_status, old_value, new_value)
    VALUES (
      NEW.id, auth.uid(), 'payment_changed', NEW.status,
      jsonb_build_object('payment_method', OLD.payment_method, 'installments', OLD.installments,
                         'payment_date', OLD.payment_date, 'is_split_payment', OLD.is_split_payment),
      jsonb_build_object('payment_method', NEW.payment_method, 'installments', NEW.installments,
                         'payment_date', NEW.payment_date, 'is_split_payment', NEW.is_split_payment)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_quote_payment_change ON public.quotes;
CREATE TRIGGER trg_log_quote_payment_change
  AFTER UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.log_quote_payment_change();

CREATE OR REPLACE FUNCTION public.log_quote_payment_block(
  _quote_id uuid,
  _action text,
  _attempted_status text,
  _error_code text,
  _missing_fields text[]
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.quote_payment_audit (quote_id, user_id, action, attempted_status, error_code, missing_fields)
  VALUES (_quote_id, auth.uid(), _action, _attempted_status, _error_code, _missing_fields);
$$;

GRANT EXECUTE ON FUNCTION public.log_quote_payment_block(uuid, text, text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quote_payment_problem(public.quotes) TO authenticated, service_role;