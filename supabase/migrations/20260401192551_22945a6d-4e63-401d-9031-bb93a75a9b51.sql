
-- Create cascade delete function
CREATE OR REPLACE FUNCTION public.delete_quote_cascade(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.quote_items WHERE quote_id = p_quote_id;
  DELETE FROM public.quotes WHERE id = p_quote_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_quote_cascade(uuid) TO authenticated;
