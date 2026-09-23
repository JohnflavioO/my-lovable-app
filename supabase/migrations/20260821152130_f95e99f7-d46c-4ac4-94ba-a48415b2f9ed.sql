-- Adicionando 'parceria' como método de pagamento válido no banco de dados.
-- Isso sincroniza o backend com a nova regra do frontend.

CREATE OR REPLACE FUNCTION public.quote_payment_problem(q public.quotes)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  -- Adicionado 'parceria' ao array de métodos válidos
  valid_methods text[] := ARRAY['pix','cartao','boleto','parceria'];
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

    -- Validação método 1
    IF m1 = 'pix' AND q.split_date_1 IS NULL THEN
      RETURN 'PAYMENT_TERMS_INCOMPLETE|Informe a data do pagamento PIX (método 1).|split_date_1';
    END IF;
    IF m1 = 'boleto' AND (q.split_date_1 IS NULL OR COALESCE(q.split_installments_1,0) < 1) THEN
      RETURN 'PAYMENT_TERMS_INCOMPLETE|Informe parcelas e vencimento inicial do boleto (método 1).|split_installments_1,split_date_1';
    END IF;
    IF m1 = 'cartao' AND (COALESCE(q.split_installments_1,0) < 1 OR q.split_installments_1 > 10) THEN
      RETURN 'PAYMENT_TERMS_INCOMPLETE|Cartão permite de 1 a 10 parcelas (método 1).|split_installments_1';
    END IF;
    -- Parceria não exige data/parcelas

    -- Validação método 2
    IF m2 = 'pix' AND q.split_date_2 IS NULL THEN
      RETURN 'PAYMENT_TERMS_INCOMPLETE|Informe a data do pagamento PIX (método 2).|split_date_2';
    END IF;
    IF m2 = 'boleto' AND (q.split_date_2 IS NULL OR COALESCE(q.split_installments_2,0) < 1) THEN
      RETURN 'PAYMENT_TERMS_INCOMPLETE|Informe parcelas e vencimento inicial do boleto (método 2).|split_installments_2,split_date_2';
    END IF;
    IF m2 = 'cartao' AND (COALESCE(q.split_installments_2,0) < 1 OR q.split_installments_2 > 10) THEN
      RETURN 'PAYMENT_TERMS_INCOMPLETE|Cartão permite de 1 a 10 parcelas (método 2).|split_installments_2';
    END IF;
    -- Parceria não exige data/parcelas

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
  -- Parceria não exige data/parcelas

  RETURN NULL;
END;
$$;