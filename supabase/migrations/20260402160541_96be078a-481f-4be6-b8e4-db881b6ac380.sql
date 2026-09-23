
-- Create tasks table
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL DEFAULT 'contato',
  status TEXT NOT NULL DEFAULT 'pendente',
  priority TEXT NOT NULL DEFAULT 'média',
  due_date TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tasks or gestor all"
  ON public.tasks FOR SELECT TO authenticated
  USING (is_approved() AND (is_gestor() OR user_id = auth.uid()));

CREATE POLICY "Users can insert own tasks"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (is_approved() AND user_id = auth.uid());

CREATE POLICY "Users can update own tasks or gestor"
  ON public.tasks FOR UPDATE TO authenticated
  USING (is_approved() AND (is_gestor() OR user_id = auth.uid()));

CREATE POLICY "Users can delete own tasks or gestor"
  ON public.tasks FOR DELETE TO authenticated
  USING (is_approved() AND (is_gestor() OR user_id = auth.uid()));

-- Add active column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

-- Allow gestors to view all profiles (for approvals page)
CREATE POLICY "Gestors can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (is_gestor());

-- Allow admins to update any profile (role, active status)
CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Allow gestors to view all approvals
CREATE POLICY "Gestors can view all approvals"
  ON public.user_approvals FOR SELECT TO authenticated
  USING (is_gestor());

-- Allow gestors to update approvals
CREATE POLICY "Gestors can update approvals"
  ON public.user_approvals FOR UPDATE TO authenticated
  USING (is_gestor());

-- Allow admin/gestor to manage user_roles
CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

-- Allow gestors to view all roles
CREATE POLICY "Gestors can view all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (is_gestor());
