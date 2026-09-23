
-- logistics_records: scope logistica policies by company_id
DROP POLICY IF EXISTS "Logistica can view all logistics records" ON public.logistics_records;
DROP POLICY IF EXISTS "Logistica can insert logistics records" ON public.logistics_records;
DROP POLICY IF EXISTS "Logistica can update logistics records" ON public.logistics_records;
DROP POLICY IF EXISTS "Logistica can delete logistics records" ON public.logistics_records;

CREATE POLICY "Logistica can view logistics records in own company"
ON public.logistics_records FOR SELECT
USING (is_logistica() AND company_id IS NOT NULL AND company_id = current_user_company_id());

CREATE POLICY "Logistica can insert logistics records in own company"
ON public.logistics_records FOR INSERT
WITH CHECK (is_logistica() AND (company_id IS NULL OR company_id = current_user_company_id()));

CREATE POLICY "Logistica can update logistics records in own company"
ON public.logistics_records FOR UPDATE
USING (is_logistica() AND company_id IS NOT NULL AND company_id = current_user_company_id())
WITH CHECK (is_logistica() AND company_id IS NOT NULL AND company_id = current_user_company_id());

CREATE POLICY "Logistica can delete logistics records in own company"
ON public.logistics_records FOR DELETE
USING (is_logistica() AND company_id IS NOT NULL AND company_id = current_user_company_id());

-- quote_freight_quotes: scope gestor/logistica via quotes.company_id; admin keeps global
DROP POLICY IF EXISTS "quote_freight_quotes select by role" ON public.quote_freight_quotes;
DROP POLICY IF EXISTS "quote_freight_quotes insert by owner or manager" ON public.quote_freight_quotes;
DROP POLICY IF EXISTS "quote_freight_quotes update by owner or manager" ON public.quote_freight_quotes;
DROP POLICY IF EXISTS "quote_freight_quotes delete by owner or manager" ON public.quote_freight_quotes;

CREATE POLICY "quote_freight_quotes select by role"
ON public.quote_freight_quotes FOR SELECT
USING (
  is_admin()
  OR EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_freight_quotes.quote_id
      AND (
        q.created_by = auth.uid()
        OR ((is_gestor() OR is_logistica()) AND q.company_id IS NOT NULL AND q.company_id = current_user_company_id())
      )
  )
);

CREATE POLICY "quote_freight_quotes insert by owner or manager"
ON public.quote_freight_quotes FOR INSERT
WITH CHECK (
  is_admin()
  OR EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_freight_quotes.quote_id
      AND (
        q.created_by = auth.uid()
        OR ((is_gestor() OR is_logistica()) AND q.company_id IS NOT NULL AND q.company_id = current_user_company_id())
      )
  )
);

CREATE POLICY "quote_freight_quotes update by owner or manager"
ON public.quote_freight_quotes FOR UPDATE
USING (
  is_admin()
  OR EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_freight_quotes.quote_id
      AND (
        q.created_by = auth.uid()
        OR ((is_gestor() OR is_logistica()) AND q.company_id IS NOT NULL AND q.company_id = current_user_company_id())
      )
  )
);

CREATE POLICY "quote_freight_quotes delete by owner or manager"
ON public.quote_freight_quotes FOR DELETE
USING (
  is_admin()
  OR EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_freight_quotes.quote_id
      AND (
        q.created_by = auth.uid()
        OR (is_gestor() AND q.company_id IS NOT NULL AND q.company_id = current_user_company_id())
      )
  )
);

-- quote_items: scope logistica by quotes.company_id
DROP POLICY IF EXISTS "Logistica can view all quote items" ON public.quote_items;

CREATE POLICY "Logistica can view quote items in own company"
ON public.quote_items FOR SELECT
USING (
  is_logistica() AND EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
      AND q.company_id IS NOT NULL
      AND q.company_id = current_user_company_id()
  )
);

-- quote_messages: scope gestor by quotes.company_id
DROP POLICY IF EXISTS "Gestor can view all messages" ON public.quote_messages;

CREATE POLICY "Gestor can view messages in own company"
ON public.quote_messages FOR SELECT
USING (
  is_gestor() AND EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_messages.quote_id
      AND COALESCE(q.company_id, current_user_company_id()) = current_user_company_id()
  )
);

-- smart_opportunities: scope gestor by company_id; admin keeps global
DROP POLICY IF EXISTS "Users can view their own opportunities" ON public.smart_opportunities;
DROP POLICY IF EXISTS "Users can update their own opportunities" ON public.smart_opportunities;
DROP POLICY IF EXISTS "Admins and gestors can insert opportunities" ON public.smart_opportunities;

CREATE POLICY "Users can view their own opportunities"
ON public.smart_opportunities FOR SELECT
USING (
  vendedor_id = auth.uid()
  OR is_admin()
  OR (is_gestor() AND company_id IS NOT NULL AND company_id = current_user_company_id())
);

CREATE POLICY "Users can update their own opportunities"
ON public.smart_opportunities FOR UPDATE
USING (
  vendedor_id = auth.uid()
  OR is_admin()
  OR (is_gestor() AND company_id IS NOT NULL AND company_id = current_user_company_id())
)
WITH CHECK (
  vendedor_id = auth.uid()
  OR is_admin()
  OR (is_gestor() AND company_id IS NOT NULL AND company_id = current_user_company_id())
);

CREATE POLICY "Admins and gestors can insert opportunities"
ON public.smart_opportunities FOR INSERT
WITH CHECK (
  is_admin()
  OR (is_gestor() AND (company_id IS NULL OR company_id = current_user_company_id()))
);
