
-- Fix john.flavio@gmail.com: create missing records
INSERT INTO public.profiles (user_id, full_name, phone)
SELECT id, 'John Flavio', '(85)98734-9599'
FROM auth.users WHERE email = 'john.flavio@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.user_approvals (user_id, status)
SELECT id, 'approved'
FROM auth.users WHERE email = 'john.flavio@gmail.com'
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'
FROM auth.users WHERE email = 'john.flavio@gmail.com'
ON CONFLICT DO NOTHING;

-- Create the missing trigger for future signups
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add unique constraints needed for ON CONFLICT
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_approvals_user_id_key') THEN
    ALTER TABLE public.user_approvals ADD CONSTRAINT user_approvals_user_id_key UNIQUE (user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_user_id_role_key') THEN
    ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
  END IF;
END $$;
