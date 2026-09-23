
-- Create salespeople table
CREATE TABLE public.salespeople (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code integer,
  phone text,
  email text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.salespeople ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view salespeople" ON public.salespeople
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_approvals WHERE user_id = auth.uid() AND status = 'approved'));

CREATE POLICY "Admins can manage salespeople" ON public.salespeople
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Import team from spreadsheet
INSERT INTO public.salespeople (name, code, phone, email) VALUES
  ('FELIPE AGUIAR', 5, '(85)98761-4881', 'felipe@mcistore.com.br'),
  ('WENDELL NASCIMENTO', 2, '(85)98549-5070', 'comercial2@mcistore.com.br'),
  ('JOÃO PAULO GOMES', 6, '(85)98802-0720', 'joão@mci.tv'),
  ('MARCEL', NULL, NULL, NULL),
  ('JOHN', 10, '(85)98734-9599', 'marketing@mcistore.com.br'),
  ('SARAH ARAGÃO', 11, NULL, 'Marketing2@mcistore.com.br'),
  ('BIANCA FAÇANHA', 12, NULL, 'bianca@mcistore.com.br'),
  ('VINICIUS LANDO', 13, NULL, 'vinicius@mcistore.com.br'),
  ('JOÃO PAULO SOUSA', 14, NULL, 'joao.sousa@mcistore.com.br'),
  ('PAULO FERNANDO', 15, NULL, NULL);
