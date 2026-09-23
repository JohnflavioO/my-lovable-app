
ALTER TABLE public.financial_records ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.technical_maintenances ADD COLUMN IF NOT EXISTS company_id uuid;

-- Backfill financial_records.company_id from quote then client
UPDATE public.financial_records fr
SET company_id = q.company_id
FROM public.quotes q
WHERE q.id = fr.quote_id AND fr.company_id IS NULL AND q.company_id IS NOT NULL;

UPDATE public.financial_records fr
SET company_id = c.company_id
FROM public.clients c
WHERE c.id = fr.client_id AND fr.company_id IS NULL AND c.company_id IS NOT NULL;

UPDATE public.financial_records SET company_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE company_id IS NULL;

-- Backfill technical_maintenances.company_id from product
UPDATE public.technical_maintenances tm
SET company_id = tp.company_id
FROM public.technical_products tp
WHERE tp.id = tm.product_id AND tm.company_id IS NULL AND tp.company_id IS NOT NULL;

UPDATE public.technical_maintenances SET company_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE company_id IS NULL;

DROP TRIGGER IF EXISTS set_company_id_financial_records ON public.financial_records;
CREATE TRIGGER set_company_id_financial_records
  BEFORE INSERT ON public.financial_records
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_profile();

DROP TRIGGER IF EXISTS set_company_id_technical_maintenances ON public.technical_maintenances;
CREATE TRIGGER set_company_id_technical_maintenances
  BEFORE INSERT ON public.technical_maintenances
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_profile();

-- clients: support scope by company
DROP POLICY IF EXISTS "Support can view crm clients" ON public.clients;
CREATE POLICY "Support can view crm clients"
  ON public.clients FOR SELECT
  USING (is_support_any() AND company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "Support can update contact fields of crm clients" ON public.clients;
CREATE POLICY "Support can update contact fields of crm clients"
  ON public.clients FOR UPDATE
  USING (is_support_any() AND company_id = public.current_user_company_id())
  WITH CHECK (is_support_any() AND company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "Support can insert crm clients via trigger" ON public.clients;
CREATE POLICY "Support can insert crm clients via trigger"
  ON public.clients FOR INSERT
  WITH CHECK (
    (is_support_any() AND company_id = public.current_user_company_id())
    OR (is_approved() AND created_by = auth.uid())
  );

-- financial_records
DROP POLICY IF EXISTS "Admins can view financial records" ON public.financial_records;
CREATE POLICY "Admins can view financial records"
  ON public.financial_records FOR SELECT
  USING (is_admin() AND company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "Financeiro and Gestor can view financial records" ON public.financial_records;
CREATE POLICY "Financeiro and Gestor can view financial records"
  ON public.financial_records FOR SELECT
  USING ((is_gestor() OR is_financeiro()) AND company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "Financeiro can insert financial records" ON public.financial_records;
CREATE POLICY "Financeiro can insert financial records"
  ON public.financial_records FOR INSERT
  WITH CHECK (is_financeiro() AND (company_id IS NULL OR company_id = public.current_user_company_id()));

DROP POLICY IF EXISTS "Financeiro can update financial records" ON public.financial_records;
CREATE POLICY "Financeiro can update financial records"
  ON public.financial_records FOR UPDATE
  USING (is_financeiro() AND company_id = public.current_user_company_id())
  WITH CHECK (is_financeiro() AND company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "Financeiro can delete financial records" ON public.financial_records;
CREATE POLICY "Financeiro can delete financial records"
  ON public.financial_records FOR DELETE
  USING (is_financeiro() AND company_id = public.current_user_company_id());

-- bank_slips
DROP POLICY IF EXISTS "Financeiro pode tudo em boletos" ON public.bank_slips;
CREATE POLICY "Financeiro pode tudo em boletos"
  ON public.bank_slips FOR ALL
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = ANY (ARRAY['admin','financeiro']))
    AND company_id = public.current_user_company_id()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = ANY (ARRAY['admin','financeiro']))
    AND (company_id IS NULL OR company_id = public.current_user_company_id())
  );

DROP POLICY IF EXISTS "Gestor pode visualizar boletos" ON public.bank_slips;
CREATE POLICY "Gestor pode visualizar boletos"
  ON public.bank_slips FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'gestor')
    AND company_id = public.current_user_company_id()
  );

-- bank_slip_history — scope through parent bank_slip
DROP POLICY IF EXISTS "Financeiro e Gestor podem ver histórico de boletos" ON public.bank_slip_history;
CREATE POLICY "Financeiro e Gestor podem ver histórico de boletos"
  ON public.bank_slip_history FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = ANY (ARRAY['admin','financeiro','gestor']))
    AND EXISTS (
      SELECT 1 FROM public.bank_slips bs
      WHERE bs.id = bank_slip_history.bank_slip_id
        AND bs.company_id = public.current_user_company_id()
    )
  );

DROP POLICY IF EXISTS "Financeiro pode inserir histórico" ON public.bank_slip_history;
CREATE POLICY "Financeiro pode inserir histórico"
  ON public.bank_slip_history FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = ANY (ARRAY['admin','financeiro']))
    AND EXISTS (
      SELECT 1 FROM public.bank_slips bs
      WHERE bs.id = bank_slip_history.bank_slip_id
        AND bs.company_id = public.current_user_company_id()
    )
  );

-- financial_action_history — scope through parent financial_record
DROP POLICY IF EXISTS "Admins can view financial action history" ON public.financial_action_history;
CREATE POLICY "Admins can view financial action history"
  ON public.financial_action_history FOR SELECT
  USING (
    is_admin() AND EXISTS (
      SELECT 1 FROM public.financial_records fr
      WHERE fr.id = financial_action_history.financial_record_id
        AND fr.company_id = public.current_user_company_id()
    )
  );

DROP POLICY IF EXISTS "Financeiro and Gestor can view action history" ON public.financial_action_history;
CREATE POLICY "Financeiro and Gestor can view action history"
  ON public.financial_action_history FOR SELECT
  USING (
    (is_financeiro() OR is_gestor()) AND EXISTS (
      SELECT 1 FROM public.financial_records fr
      WHERE fr.id = financial_action_history.financial_record_id
        AND fr.company_id = public.current_user_company_id()
    )
  );

DROP POLICY IF EXISTS "Financeiro can insert action history" ON public.financial_action_history;
CREATE POLICY "Financeiro can insert action history"
  ON public.financial_action_history FOR INSERT
  WITH CHECK (
    is_financeiro() AND EXISTS (
      SELECT 1 FROM public.financial_records fr
      WHERE fr.id = financial_action_history.financial_record_id
        AND fr.company_id = public.current_user_company_id()
    )
  );

-- technical_maintenances
DROP POLICY IF EXISTS "Support and managers can view maintenance" ON public.technical_maintenances;
CREATE POLICY "Support and managers can view maintenance"
  ON public.technical_maintenances FOR SELECT
  USING ((is_support_any() OR is_admin() OR is_gestor()) AND company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "Support staff can insert maintenance" ON public.technical_maintenances;
CREATE POLICY "Support staff can insert maintenance"
  ON public.technical_maintenances FOR INSERT
  WITH CHECK ((is_support_any() OR is_admin()) AND (company_id IS NULL OR company_id = public.current_user_company_id()));

DROP POLICY IF EXISTS "Support staff can update maintenance" ON public.technical_maintenances;
CREATE POLICY "Support staff can update maintenance"
  ON public.technical_maintenances FOR UPDATE
  USING ((is_support_any() OR is_admin()) AND company_id = public.current_user_company_id())
  WITH CHECK ((is_support_any() OR is_admin()) AND company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "Support managers can delete maintenance" ON public.technical_maintenances;
CREATE POLICY "Support managers can delete maintenance"
  ON public.technical_maintenances FOR DELETE
  USING ((is_support_manager() OR is_admin()) AND company_id = public.current_user_company_id());
