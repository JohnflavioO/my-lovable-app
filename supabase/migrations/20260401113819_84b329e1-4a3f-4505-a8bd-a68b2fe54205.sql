
-- User roles (must be first, referenced by other policies)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  role TEXT DEFAULT 'comercial',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

-- User approvals
CREATE TABLE public.user_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.user_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own approval" ON public.user_approvals FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can view all approvals" ON public.user_approvals FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins can update approvals" ON public.user_approvals FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

-- Clients
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved users can view clients" ON public.clients FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_approvals WHERE user_id = auth.uid() AND status = 'approved')
);
CREATE POLICY "Approved users can insert clients" ON public.clients FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_approvals WHERE user_id = auth.uid() AND status = 'approved')
);
CREATE POLICY "Approved users can update clients" ON public.clients FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_approvals WHERE user_id = auth.uid() AND status = 'approved')
);

-- Quotes
CREATE TABLE public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number TEXT NOT NULL DEFAULT public.generate_quote_number(),
  client_id UUID REFERENCES public.clients(id),
  client_name TEXT NOT NULL DEFAULT '',
  salesperson TEXT,
  status TEXT DEFAULT 'draft',
  quote_date DATE DEFAULT CURRENT_DATE,
  total NUMERIC(12,2) DEFAULT 0,
  discount NUMERIC(5,2) DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved users can view quotes" ON public.quotes FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_approvals WHERE user_id = auth.uid() AND status = 'approved')
);
CREATE POLICY "Approved users can insert quotes" ON public.quotes FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_approvals WHERE user_id = auth.uid() AND status = 'approved')
);
CREATE POLICY "Approved users can update quotes" ON public.quotes FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_approvals WHERE user_id = auth.uid() AND status = 'approved')
);

-- Quote items
CREATE TABLE public.quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID REFERENCES public.quotes(id) ON DELETE CASCADE NOT NULL,
  item_number INT DEFAULT 1,
  code TEXT,
  description TEXT NOT NULL DEFAULT '',
  quantity INT DEFAULT 1,
  unit_price NUMERIC(12,2) DEFAULT 0,
  total_price NUMERIC(12,2) DEFAULT 0,
  category TEXT DEFAULT 'audio'
);
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved users can view quote items" ON public.quote_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_approvals WHERE user_id = auth.uid() AND status = 'approved')
);
CREATE POLICY "Approved users can insert quote items" ON public.quote_items FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_approvals WHERE user_id = auth.uid() AND status = 'approved')
);
CREATE POLICY "Approved users can update quote items" ON public.quote_items FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_approvals WHERE user_id = auth.uid() AND status = 'approved')
);
CREATE POLICY "Approved users can delete quote items" ON public.quote_items FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_approvals WHERE user_id = auth.uid() AND status = 'approved')
);

-- Auto-create profile, approval, and admin role for first user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (user_id, full_name, phone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), COALESCE(NEW.raw_user_meta_data->>'phone', ''));
  
  SELECT COUNT(*) INTO user_count FROM public.profiles WHERE user_id != NEW.id;
  
  IF user_count = 0 THEN
    INSERT INTO public.user_approvals (user_id, status) VALUES (NEW.id, 'approved');
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_approvals (user_id, status) VALUES (NEW.id, 'pending');
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
