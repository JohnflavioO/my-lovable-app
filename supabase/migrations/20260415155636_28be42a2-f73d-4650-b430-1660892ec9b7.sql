-- Add force_password_change flag to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS force_password_change boolean NOT NULL DEFAULT false;

-- Create password reset log table
CREATE TABLE IF NOT EXISTS public.password_reset_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL,
  performed_by uuid NOT NULL,
  performed_by_name text,
  target_user_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.password_reset_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can insert reset logs"
ON public.password_reset_log
FOR INSERT
TO authenticated
WITH CHECK (is_admin());

CREATE POLICY "Admins can view all reset logs"
ON public.password_reset_log
FOR SELECT
TO authenticated
USING (is_admin());