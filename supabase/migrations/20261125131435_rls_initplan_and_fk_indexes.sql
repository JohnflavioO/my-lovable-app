-- Desempenho sem mudança de regra:
-- (a) auth.uid()/auth.role()/auth.jwt() nas policies passam a ser avaliados uma
--     vez por consulta, e não uma vez por linha. Resultado idêntico.
-- (b) Índices para chaves estrangeiras sem índice (só leitura mais rápida).

DO $$
DECLARE
  r record;
  v_qual text;
  v_check text;
  v_stmt text;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND (coalesce(qual, '') || coalesce(with_check, '')) ~ '(?<!SELECT )auth\.(uid|role|jwt)\(\)'
  LOOP
    v_qual  := regexp_replace(r.qual,       '(?<!SELECT )auth\.(uid|role|jwt)\(\)', '(SELECT auth.\1())', 'g');
    v_check := regexp_replace(r.with_check, '(?<!SELECT )auth\.(uid|role|jwt)\(\)', '(SELECT auth.\1())', 'g');
    v_stmt  := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
    IF v_qual IS NOT NULL THEN
      v_stmt := v_stmt || ' USING (' || v_qual || ')';
    END IF;
    IF v_check IS NOT NULL THEN
      v_stmt := v_stmt || ' WITH CHECK (' || v_check || ')';
    END IF;
    EXECUTE v_stmt;
  END LOOP;
END;
$$;

DO $$
DECLARE
  r record;
  v_cols text;
  v_name text;
BEGIN
  FOR r IN
    SELECT c.conrelid, rel.relname, c.conkey
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
     WHERE c.contype = 'f'
       AND rel.relnamespace = 'public'::regnamespace
       AND NOT EXISTS (
         SELECT 1
           FROM pg_index i
          WHERE i.indrelid = c.conrelid
            AND array_to_string((i.indkey::int2[])[0:array_length(c.conkey, 1) - 1], ',')
                = array_to_string(c.conkey, ',')
       )
  LOOP
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord),
           string_agg(a.attname, '_' ORDER BY k.ord)
      INTO v_cols, v_name
      FROM unnest(r.conkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = r.conrelid AND a.attnum = k.attnum;

    v_name := left('idx_' || r.relname || '_' || v_name, 63);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)', v_name, r.relname, v_cols);
  END LOOP;
END;
$$;
