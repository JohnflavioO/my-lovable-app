-- Admin enxerga todos os orçamentos, mas os itens só apareciam para o dono do
-- orçamento ou para gestores. Resultado: para um admin, orçamentos de outros
-- vendedores abriam sem produtos (e o backup exportado por um admin saiu sem esses itens).
-- A regra de INSERT já incluía is_admin(); aqui SELECT, UPDATE e DELETE passam a incluir também.

DROP POLICY IF EXISTS "Users can view quote items by role" ON public.quote_items;
CREATE POLICY "Users can view quote items by role"
ON public.quote_items FOR SELECT TO authenticated
USING (
  public.is_approved() AND (
    public.is_admin()
    OR public.is_gestor()
    OR EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id AND q.created_by = auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can update quote items by role" ON public.quote_items;
CREATE POLICY "Users can update quote items by role"
ON public.quote_items FOR UPDATE TO authenticated
USING (
  public.is_approved() AND (
    public.is_admin()
    OR public.is_gestor()
    OR EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id AND q.created_by = auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can delete quote items by role" ON public.quote_items;
CREATE POLICY "Users can delete quote items by role"
ON public.quote_items FOR DELETE TO authenticated
USING (
  public.is_approved() AND (
    public.is_admin()
    OR public.is_gestor()
    OR EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id AND q.created_by = auth.uid())
  )
);
