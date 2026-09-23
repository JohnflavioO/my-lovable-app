-- Ajustar FKs para facilitar join do Supabase
ALTER TABLE public.smart_opportunities DROP CONSTRAINT IF EXISTS smart_opportunities_vendedor_id_fkey;

-- FK real para auth.users (integridade)
ALTER TABLE public.smart_opportunities 
ADD CONSTRAINT smart_opportunities_vendedor_id_fkey_auth 
FOREIGN KEY (vendedor_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- FK para profiles (facilitar join)
ALTER TABLE public.smart_opportunities 
ADD CONSTRAINT smart_opportunities_vendedor_id_fkey_profiles 
FOREIGN KEY (vendedor_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;