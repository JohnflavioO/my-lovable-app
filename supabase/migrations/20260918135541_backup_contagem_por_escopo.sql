-- Cópia de drizzle/migrations/0001_add_scoped_backup_count.sql.
CREATE OR REPLACE FUNCTION public.backup_export_count(p_table text, p_company_id uuid DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE page jsonb; cursor_created timestamptz := NULL; cursor_key text := NULL; total bigint := 0; n integer;
BEGIN
  LOOP
    page := public.backup_export_page(p_table,p_company_id,cursor_created,cursor_key,500);
    n := jsonb_array_length(COALESCE(page->'rows','[]'::jsonb)); total := total+n;
    EXIT WHEN n=0 OR page->'next_cursor' IS NULL OR n<500;
    cursor_key := page->'next_cursor'->>'key';
    cursor_created := NULLIF(page->'next_cursor'->>'created_at','')::timestamptz;
  END LOOP;
  RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.backup_export_count(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.backup_export_count(text,uuid) TO service_role;