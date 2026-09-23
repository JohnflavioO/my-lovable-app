-- Adiciona a coluna de permissões se ela não existir
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'permissions') THEN
        ALTER TABLE public.profiles ADD COLUMN permissions JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- Comentário para documentar a coluna
COMMENT ON COLUMN public.profiles.permissions IS 'Permissões granulares do usuário no formato JSONB (ex: {"products.create": true})';
