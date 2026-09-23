UPDATE public.clients
SET created_by = COALESCE(assigned_user_id, salesperson_id)
WHERE source = 'landing_revenda_mci'
  AND created_by IS NULL
  AND COALESCE(assigned_user_id, salesperson_id) IS NOT NULL;