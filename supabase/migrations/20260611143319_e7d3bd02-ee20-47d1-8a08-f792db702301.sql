-- Remover políticas antigas para reconstruir com foco em multiempresa
DROP POLICY IF EXISTS "Users can manage contracts" ON public.generated_contracts;

-- Política de Inserção (INSERT)
-- Garante que o usuário só insira contratos para sua própria empresa e se identifique como criador
CREATE POLICY "generated_contracts_insert_policy" ON public.generated_contracts
  FOR INSERT TO authenticated
  WITH CHECK (
    (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())) AND
    (created_by = auth.uid())
  );

-- Política de Seleção (SELECT)
-- Usuários veem contratos da sua empresa, Admins veem tudo
CREATE POLICY "generated_contracts_select_policy" ON public.generated_contracts
  FOR SELECT TO authenticated
  USING (
    (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())) OR
    (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  );

-- Política de Atualização (UPDATE)
CREATE POLICY "generated_contracts_update_policy" ON public.generated_contracts
  FOR UPDATE TO authenticated
  USING (
    (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())) OR
    (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  )
  WITH CHECK (
    (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())) OR
    (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  );

-- Política de Exclusão (DELETE)
CREATE POLICY "generated_contracts_delete_policy" ON public.generated_contracts
  FOR DELETE TO authenticated
  USING (
    (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())) OR
    (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  );
