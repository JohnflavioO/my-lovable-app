-- Adiciona a coluna can_access_support_manager na tabela profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS can_access_support_manager BOOLEAN DEFAULT false;

-- Atualiza a função is_support_manager para considerar a nova permissão do gestor
CREATE OR REPLACE FUNCTION public.is_support_manager()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  -- Caso 1: Usuário tem a role explícita de support_manager
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'support_manager') THEN
    RETURN TRUE;
  END IF;

  -- Caso 2: Usuário é Gestor e tem a permissão configurável habilitada no perfil
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND (role = 'gestor' OR role = 'Gestor')
    AND can_access_support_manager = true
  );
END; $$;
