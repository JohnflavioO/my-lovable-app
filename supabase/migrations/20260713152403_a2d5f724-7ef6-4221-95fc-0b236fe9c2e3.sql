
DROP POLICY IF EXISTS "Gestor can view messages in own company" ON public.quote_messages;
CREATE POLICY "Gestor can view messages in own company" ON public.quote_messages
FOR SELECT USING (
  is_gestor() AND EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_messages.quote_id
      AND q.company_id IS NOT NULL
      AND q.company_id = current_user_company_id()
  )
);

DROP POLICY IF EXISTS "Financeiro can view messages on financial quotes" ON public.quote_messages;
CREATE POLICY "Financeiro can view messages on financial quotes" ON public.quote_messages
FOR SELECT USING (
  is_financeiro() AND EXISTS (
    SELECT 1 FROM public.financial_records fr
    JOIN public.quotes q ON q.id = fr.quote_id
    WHERE fr.quote_id = quote_messages.quote_id
      AND q.company_id IS NOT NULL
      AND q.company_id = current_user_company_id()
  )
);

DROP POLICY IF EXISTS "Financeiro can send messages on financial quotes" ON public.quote_messages;
CREATE POLICY "Financeiro can send messages on financial quotes" ON public.quote_messages
FOR INSERT WITH CHECK (
  is_financeiro() AND user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.financial_records fr
    JOIN public.quotes q ON q.id = fr.quote_id
    WHERE fr.quote_id = quote_messages.quote_id
      AND q.company_id IS NOT NULL
      AND q.company_id = current_user_company_id()
  )
);

DROP POLICY IF EXISTS "Logistica can view messages on logistics quotes" ON public.quote_messages;
CREATE POLICY "Logistica can view messages on logistics quotes" ON public.quote_messages
FOR SELECT USING (
  is_logistica() AND EXISTS (
    SELECT 1 FROM public.logistics_records lr
    JOIN public.quotes q ON q.id = lr.quote_id
    WHERE lr.quote_id = quote_messages.quote_id
      AND q.company_id IS NOT NULL
      AND q.company_id = current_user_company_id()
  )
);

DROP POLICY IF EXISTS "Logistica can send messages on logistics quotes" ON public.quote_messages;
CREATE POLICY "Logistica can send messages on logistics quotes" ON public.quote_messages
FOR INSERT WITH CHECK (
  is_logistica() AND user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.logistics_records lr
    JOIN public.quotes q ON q.id = lr.quote_id
    WHERE lr.quote_id = quote_messages.quote_id
      AND q.company_id IS NOT NULL
      AND q.company_id = current_user_company_id()
  )
);
