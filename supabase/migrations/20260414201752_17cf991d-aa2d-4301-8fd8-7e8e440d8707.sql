-- Prevent users from changing their own role via the profile update policy
-- Create a trigger that blocks role changes unless performed by an admin
CREATE OR REPLACE FUNCTION public.prevent_self_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If role is being changed
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    -- Only allow if the current user is an admin
    IF NOT public.is_admin() THEN
      -- Silently revert the role change
      NEW.role := OLD.role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Drop if exists to be safe
DROP TRIGGER IF EXISTS prevent_self_role_change_trigger ON public.profiles;

CREATE TRIGGER prevent_self_role_change_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_role_change();