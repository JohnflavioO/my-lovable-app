
-- ============================================================
-- 1) CLIENTS: escopo por empresa para gestor
-- ============================================================
DROP POLICY IF EXISTS "Admins and gestors full access to clients" ON public.clients;

CREATE POLICY "Admins full access to clients"
ON public.clients FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Gestores full access to clients in own company"
ON public.clients FOR ALL
USING (public.is_gestor() AND company_id IS NOT NULL AND company_id = public.current_user_company_id())
WITH CHECK (public.is_gestor() AND company_id IS NOT NULL AND company_id = public.current_user_company_id());

-- ============================================================
-- 2) QUOTES: escopo por empresa para gestor
-- ============================================================
DROP POLICY IF EXISTS "Admins and Gestores can view all quotes" ON public.quotes;
DROP POLICY IF EXISTS "Admins and Gestores can update all quotes" ON public.quotes;

CREATE POLICY "Admins can view all quotes"
ON public.quotes FOR SELECT
USING (public.is_admin());

CREATE POLICY "Admins can update all quotes"
ON public.quotes FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Gestores can view quotes in own company"
ON public.quotes FOR SELECT
USING (public.is_gestor() AND company_id IS NOT NULL AND company_id = public.current_user_company_id());

CREATE POLICY "Gestores can update quotes in own company"
ON public.quotes FOR UPDATE
USING (public.is_gestor() AND company_id IS NOT NULL AND company_id = public.current_user_company_id())
WITH CHECK (public.is_gestor() AND company_id IS NOT NULL AND company_id = public.current_user_company_id());

-- ============================================================
-- 3) LOGISTICS_RECORDS: adicionar company_id + escopar gestor
-- ============================================================
ALTER TABLE public.logistics_records
  ADD COLUMN IF NOT EXISTS company_id uuid;

-- Backfill a partir do orçamento vinculado
UPDATE public.logistics_records lr
SET company_id = q.company_id
FROM public.quotes q
WHERE lr.quote_id = q.id AND lr.company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_logistics_records_company_id
  ON public.logistics_records(company_id);

-- Trigger para preencher company_id a partir da quote
CREATE OR REPLACE FUNCTION public.set_logistics_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.quote_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.quotes WHERE id = NEW.quote_id;
  END IF;
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.current_user_company_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_logistics_company_id ON public.logistics_records;
CREATE TRIGGER trg_set_logistics_company_id
  BEFORE INSERT OR UPDATE ON public.logistics_records
  FOR EACH ROW EXECUTE FUNCTION public.set_logistics_company_id();

-- Escopar policy do gestor por empresa (admin mantém acesso amplo)
DROP POLICY IF EXISTS "Gestor can view all logistics records" ON public.logistics_records;
CREATE POLICY "Gestor can view logistics records in own company"
ON public.logistics_records FOR SELECT
USING (public.is_gestor() AND company_id IS NOT NULL AND company_id = public.current_user_company_id());

-- ============================================================
-- 4) TECHNICAL TABLES: adicionar company_id e escopar
-- ============================================================

-- 4a) technical_suppliers
ALTER TABLE public.technical_suppliers ADD COLUMN IF NOT EXISTS company_id uuid;
CREATE INDEX IF NOT EXISTS idx_technical_suppliers_company_id ON public.technical_suppliers(company_id);

-- 4b) technical_services
ALTER TABLE public.technical_services ADD COLUMN IF NOT EXISTS company_id uuid;
CREATE INDEX IF NOT EXISTS idx_technical_services_company_id ON public.technical_services(company_id);

-- 4c) technical_cloud_files
ALTER TABLE public.technical_cloud_files ADD COLUMN IF NOT EXISTS company_id uuid;
CREATE INDEX IF NOT EXISTS idx_technical_cloud_files_company_id ON public.technical_cloud_files(company_id);

-- 4d) technical_budgets - backfill via technical_orders
ALTER TABLE public.technical_budgets ADD COLUMN IF NOT EXISTS company_id uuid;
UPDATE public.technical_budgets tb
SET company_id = tord.company_id
FROM public.technical_orders tord
WHERE tb.technical_order_id = tord.id AND tb.company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_technical_budgets_company_id ON public.technical_budgets(company_id);

-- 4e) technical_purchase_orders
ALTER TABLE public.technical_purchase_orders ADD COLUMN IF NOT EXISTS company_id uuid;
CREATE INDEX IF NOT EXISTS idx_technical_purchase_orders_company_id ON public.technical_purchase_orders(company_id);

-- Trigger genérica: preenche company_id a partir do perfil do usuário
CREATE OR REPLACE FUNCTION public.set_company_id_from_current_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.current_user_company_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_company_id ON public.technical_suppliers;
CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.technical_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_current_user();

DROP TRIGGER IF EXISTS trg_set_company_id ON public.technical_services;
CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.technical_services
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_current_user();

DROP TRIGGER IF EXISTS trg_set_company_id ON public.technical_cloud_files;
CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.technical_cloud_files
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_current_user();

DROP TRIGGER IF EXISTS trg_set_company_id ON public.technical_purchase_orders;
CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.technical_purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_current_user();

-- Trigger para budgets: preencher a partir da OS
CREATE OR REPLACE FUNCTION public.set_technical_budget_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.technical_order_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.technical_orders WHERE id = NEW.technical_order_id;
  END IF;
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.current_user_company_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_technical_budget_company_id ON public.technical_budgets;
CREATE TRIGGER trg_set_technical_budget_company_id BEFORE INSERT ON public.technical_budgets
  FOR EACH ROW EXECUTE FUNCTION public.set_technical_budget_company_id();

-- ============================================================
-- 4f) Policies: substituir "Support Access" por versões com escopo
-- Admin mantém acesso total; gestor/support ficam restritos à empresa
-- ============================================================

-- technical_suppliers
DROP POLICY IF EXISTS "Support Access" ON public.technical_suppliers;
CREATE POLICY "Admins full access to technical_suppliers"
  ON public.technical_suppliers FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Gestor and Support access technical_suppliers in own company"
  ON public.technical_suppliers FOR ALL
  USING ((public.is_gestor() OR public.is_support_any()) AND company_id IS NOT NULL AND company_id = public.current_user_company_id())
  WITH CHECK ((public.is_gestor() OR public.is_support_any()) AND company_id IS NOT NULL AND company_id = public.current_user_company_id());

-- technical_services
DROP POLICY IF EXISTS "Support Access" ON public.technical_services;
CREATE POLICY "Admins full access to technical_services"
  ON public.technical_services FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Gestor and Support access technical_services in own company"
  ON public.technical_services FOR ALL
  USING ((public.is_gestor() OR public.is_support_any()) AND company_id IS NOT NULL AND company_id = public.current_user_company_id())
  WITH CHECK ((public.is_gestor() OR public.is_support_any()) AND company_id IS NOT NULL AND company_id = public.current_user_company_id());

-- technical_cloud_files
DROP POLICY IF EXISTS "Support Access" ON public.technical_cloud_files;
CREATE POLICY "Admins full access to technical_cloud_files"
  ON public.technical_cloud_files FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Gestor and Support access technical_cloud_files in own company"
  ON public.technical_cloud_files FOR ALL
  USING ((public.is_gestor() OR public.is_support_any()) AND company_id IS NOT NULL AND company_id = public.current_user_company_id())
  WITH CHECK ((public.is_gestor() OR public.is_support_any()) AND company_id IS NOT NULL AND company_id = public.current_user_company_id());

-- technical_budgets
DROP POLICY IF EXISTS "Support Access" ON public.technical_budgets;
CREATE POLICY "Admins full access to technical_budgets"
  ON public.technical_budgets FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Gestor and Support access technical_budgets in own company"
  ON public.technical_budgets FOR ALL
  USING ((public.is_gestor() OR public.is_support_any()) AND company_id IS NOT NULL AND company_id = public.current_user_company_id())
  WITH CHECK ((public.is_gestor() OR public.is_support_any()) AND company_id IS NOT NULL AND company_id = public.current_user_company_id());

-- technical_purchase_orders
DROP POLICY IF EXISTS "Support Access" ON public.technical_purchase_orders;
CREATE POLICY "Admins full access to technical_purchase_orders"
  ON public.technical_purchase_orders FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Gestor and Support access technical_purchase_orders in own company"
  ON public.technical_purchase_orders FOR ALL
  USING ((public.is_gestor() OR public.is_support_any()) AND company_id IS NOT NULL AND company_id = public.current_user_company_id())
  WITH CHECK ((public.is_gestor() OR public.is_support_any()) AND company_id IS NOT NULL AND company_id = public.current_user_company_id());

-- technical_purchase_order_items: escopar via join no parent
DROP POLICY IF EXISTS "Support Access" ON public.technical_purchase_order_items;
CREATE POLICY "Admins full access to technical_purchase_order_items"
  ON public.technical_purchase_order_items FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Gestor and Support access purchase_order_items in own company"
  ON public.technical_purchase_order_items FOR ALL
  USING (
    (public.is_gestor() OR public.is_support_any())
    AND EXISTS (
      SELECT 1 FROM public.technical_purchase_orders po
      WHERE po.id = technical_purchase_order_items.purchase_order_id
        AND po.company_id IS NOT NULL
        AND po.company_id = public.current_user_company_id()
    )
  )
  WITH CHECK (
    (public.is_gestor() OR public.is_support_any())
    AND EXISTS (
      SELECT 1 FROM public.technical_purchase_orders po
      WHERE po.id = technical_purchase_order_items.purchase_order_id
        AND po.company_id IS NOT NULL
        AND po.company_id = public.current_user_company_id()
    )
  );

-- technical_order_parts: escopar via join no technical_orders (já tem company_id)
DROP POLICY IF EXISTS "Support access order parts" ON public.technical_order_parts;
CREATE POLICY "Admins full access to technical_order_parts"
  ON public.technical_order_parts FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Gestor and Support access order_parts in own company"
  ON public.technical_order_parts FOR ALL
  USING (
    (public.is_gestor() OR public.is_support_any())
    AND EXISTS (
      SELECT 1 FROM public.technical_orders tord
      WHERE tord.id = technical_order_parts.order_id
        AND tord.company_id IS NOT NULL
        AND tord.company_id = public.current_user_company_id()
    )
  )
  WITH CHECK (
    (public.is_gestor() OR public.is_support_any())
    AND EXISTS (
      SELECT 1 FROM public.technical_orders tord
      WHERE tord.id = technical_order_parts.order_id
        AND tord.company_id IS NOT NULL
        AND tord.company_id = public.current_user_company_id()
    )
  );
