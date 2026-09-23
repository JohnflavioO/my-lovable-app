-- Primeiro, vamos garantir que o usuário tenha acesso básico à tabela
GRANT ALL ON public.generated_contracts TO authenticated;
GRANT ALL ON public.generated_contracts TO service_role;

-- Remover políticas antigas para evitar conflitos
DROP POLICY IF EXISTS "generated_contracts_insert_policy" ON public.generated_contracts;
DROP POLICY IF EXISTS "generated_contracts_select_policy" ON public.generated_contracts;
DROP POLICY IF EXISTS "generated_contracts_update_policy" ON public.generated_contracts;
DROP POLICY IF EXISTS "generated_contracts_delete_policy" ON public.generated_contracts;

-- Nova política de SELECT: Usuário vê contratos da sua empresa ou se for admin
CREATE POLICY "generated_contracts_select_policy" ON public.generated_contracts
FOR SELECT TO authenticated
USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Nova política de INSERT: Validar empresa do usuário
CREATE POLICY "generated_contracts_insert_policy" ON public.generated_contracts
FOR INSERT TO authenticated
WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND created_by = auth.uid()
);

-- Nova política de UPDATE: Mesma lógica do SELECT
CREATE POLICY "generated_contracts_update_policy" ON public.generated_contracts
FOR UPDATE TO authenticated
USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
)
WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Nova política de DELETE
CREATE POLICY "generated_contracts_delete_policy" ON public.generated_contracts
FOR DELETE TO authenticated
USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);