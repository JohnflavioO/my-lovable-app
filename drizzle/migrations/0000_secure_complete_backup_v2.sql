CREATE TABLE public.backup_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL,
  requester_email text,
  requester_role text NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('company','all')),
  company_id uuid,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  duration_ms bigint,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT ON public.backup_audit_log TO authenticated;
GRANT ALL ON public.backup_audit_log TO service_role;
ALTER TABLE public.backup_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view backup audit log" ON public.backup_audit_log FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.backup_list_public_tables()
RETURNS TABLE(table_name text, has_created_at boolean, key_column text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT t.tablename::text,
    EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.tablename AND c.column_name='created_at'),
    COALESCE((SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) WHERE i.indrelid=format('public.%I',t.tablename)::regclass AND i.indisprimary ORDER BY array_position(i.indkey,a.attnum) LIMIT 1),
             (SELECT c.column_name FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.tablename AND c.column_name='id' LIMIT 1))::text
  FROM pg_tables t WHERE t.schemaname='public'
    AND t.tablename NOT IN ('backup_audit_log','cnpj_lookup_cache','equivalence_search_cache','reseller_rate_limit')
  ORDER BY t.tablename;
$$;
REVOKE ALL ON FUNCTION public.backup_list_public_tables() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backup_list_public_tables() TO service_role;

CREATE OR REPLACE FUNCTION public.backup_export_page(
  p_table text, p_company_id uuid DEFAULT NULL, p_cursor_created timestamptz DEFAULT NULL,
  p_cursor_key text DEFAULT NULL, p_limit integer DEFAULT 500
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  direct_tables constant text[] := ARRAY['assistant_audit_log','assistant_conversations','bank_slips','clients','contract_signature_events','contract_signature_requests','contract_templates','equivalence_search_history','financial_import_batches','financial_records','generated_contracts','logistics_records','notifications','product_equivalences','product_external_links','product_relationships','products','profiles','quote_freight_quotes','quotes','smart_opportunities','sync_execution_logs','technical_budget_versions','technical_budgets','technical_clients','technical_cloud_files','technical_maintenances','technical_orders','technical_products','technical_purchase_orders','technical_services','technical_suppliers','user_push_tokens'];
  user_tables constant text[] := ARRAY['user_approvals','user_permissions','user_preferences','user_roles','followup_notification_logs','password_reset_log','import_logs','task_boards'];
  global_tables constant text[] := ARRAY['app_changelog','help_videos','integrations','reseller_consultant_history','reseller_consultants','reseller_registration_history','reseller_registrations','salespeople','system_settings','technical_brands'];
  excluded_tables constant text[] := ARRAY['backup_audit_log','cnpj_lookup_cache','equivalence_search_cache','reseller_rate_limit'];
  has_created boolean; key_col text; has_company boolean; has_created_by boolean; has_user_id boolean; has_salesperson boolean; has_assigned boolean;
  scope_sql text := 'TRUE'; cursor_sql text := ''; order_sql text; q text; result jsonb;
BEGIN
  IF p_limit < 1 OR p_limit > 500 THEN RAISE EXCEPTION 'limite inválido'; END IF;
  IF p_table = ANY(excluded_tables) THEN RAISE EXCEPTION 'tabela % excluída do backup', p_table; END IF;
  SELECT l.has_created_at,l.key_column INTO has_created,key_col FROM public.backup_list_public_tables() l WHERE l.table_name=p_table;
  IF key_col IS NULL THEN RAISE EXCEPTION 'tabela % sem chave estável', p_table; END IF;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=p_table AND column_name='company_id'),
         EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=p_table AND column_name='created_by'),
         EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=p_table AND column_name='user_id'),
         EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=p_table AND column_name='salesperson_id'),
         EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=p_table AND column_name='assigned_user_id')
    INTO has_company,has_created_by,has_user_id,has_salesperson,has_assigned;

  IF p_company_id IS NOT NULL THEN
    IF p_table = ANY(global_tables) THEN RETURN jsonb_build_object('rows','[]'::jsonb,'next_cursor',NULL,'global_skipped',true); END IF;
    IF p_table = ANY(direct_tables) THEN
      scope_sql := format('(t.company_id = %L::uuid',p_company_id);
      IF has_created_by THEN scope_sql:=scope_sql||format(' OR (t.company_id IS NULL AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=t.created_by AND p.company_id=%L::uuid))',p_company_id); END IF;
      IF has_user_id THEN scope_sql:=scope_sql||format(' OR (t.company_id IS NULL AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=t.user_id AND p.company_id=%L::uuid))',p_company_id); END IF;
      IF has_salesperson THEN scope_sql:=scope_sql||format(' OR (t.company_id IS NULL AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=t.salesperson_id AND p.company_id=%L::uuid))',p_company_id); END IF;
      IF has_assigned THEN scope_sql:=scope_sql||format(' OR (t.company_id IS NULL AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=t.assigned_user_id AND p.company_id=%L::uuid))',p_company_id); END IF;
      scope_sql:=scope_sql||')';
    ELSIF p_table = ANY(user_tables) THEN
      scope_sql:=format('EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=t.user_id AND p.company_id=%L::uuid)',p_company_id);
    ELSIF p_table IN ('quote_items','quote_messages','quote_payment_audit','quote_recycle_requests') THEN
      scope_sql:=format('EXISTS (SELECT 1 FROM public.quotes q WHERE q.id=t.quote_id AND (q.company_id=%L::uuid OR (q.company_id IS NULL AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=q.created_by AND p.company_id=%L::uuid))))',p_company_id,p_company_id);
    ELSIF p_table='assistant_messages' THEN scope_sql:=format('EXISTS (SELECT 1 FROM public.assistant_conversations x WHERE x.id=t.conversation_id AND x.company_id=%L::uuid)',p_company_id);
    ELSIF p_table IN ('bank_slip_history') THEN scope_sql:=format('EXISTS (SELECT 1 FROM public.bank_slips x WHERE x.id=t.bank_slip_id AND x.company_id=%L::uuid)',p_company_id);
    ELSIF p_table='financial_action_history' THEN scope_sql:=format('EXISTS (SELECT 1 FROM public.financial_records x WHERE x.id=t.financial_record_id AND x.company_id=%L::uuid)',p_company_id);
    ELSIF p_table IN ('logistics_item_status','logistics_action_history') THEN scope_sql:=format('EXISTS (SELECT 1 FROM public.logistics_records x WHERE x.id=t.logistics_record_id AND (x.company_id=%L::uuid OR (x.company_id IS NULL AND EXISTS (SELECT 1 FROM public.quotes q JOIN public.profiles p ON p.user_id=q.created_by WHERE q.id=x.quote_id AND p.company_id=%L::uuid))))',p_company_id,p_company_id);
    ELSIF p_table IN ('tasks','task_activities','task_checklists','task_columns','task_comments') THEN
      IF p_table='tasks' THEN scope_sql:=format('EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=t.user_id AND p.company_id=%L::uuid)',p_company_id);
      ELSIF p_table='task_columns' THEN scope_sql:=format('EXISTS (SELECT 1 FROM public.task_boards b JOIN public.profiles p ON p.user_id=b.user_id WHERE b.id=t.board_id AND p.company_id=%L::uuid)',p_company_id);
      ELSE scope_sql:=format('EXISTS (SELECT 1 FROM public.tasks x JOIN public.profiles p ON p.user_id=x.user_id WHERE x.id=t.task_id AND p.company_id=%L::uuid)',p_company_id); END IF;
    ELSIF p_table IN ('technical_order_parts','technical_status_history') THEN scope_sql:=format('EXISTS (SELECT 1 FROM public.technical_orders x WHERE x.id=t.order_id AND x.company_id=%L::uuid)',p_company_id);
    ELSIF p_table='technical_purchase_order_items' THEN scope_sql:=format('EXISTS (SELECT 1 FROM public.technical_purchase_orders x WHERE x.id=t.purchase_order_id AND x.company_id=%L::uuid)',p_company_id);
    ELSE RAISE EXCEPTION 'tabela % sem regra de empresa',p_table;
    END IF;
  END IF;

  IF has_created THEN
    order_sql:=format('t.created_at, t.%I::text',key_col);
    IF p_cursor_created IS NOT NULL THEN cursor_sql:=format(' AND (t.created_at,t.%I::text)>(%L::timestamptz,%L)',key_col,p_cursor_created,p_cursor_key); END IF;
  ELSE
    order_sql:=format('t.%I::text',key_col);
    IF p_cursor_key IS NOT NULL THEN cursor_sql:=format(' AND t.%I::text>%L',key_col,p_cursor_key); END IF;
  END IF;
  q:=format('WITH page AS (SELECT t.* FROM public.%I t WHERE %s %s ORDER BY %s LIMIT %s), packed AS (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY %s),''[]''::jsonb) rows FROM page p) SELECT jsonb_build_object(''rows'',packed.rows,''next_cursor'',CASE WHEN jsonb_array_length(packed.rows)=0 THEN NULL ELSE jsonb_build_object(''created_at'',CASE WHEN %L THEN packed.rows->-1->>''created_at'' ELSE NULL END,''key'',packed.rows->-1->>%L) END) FROM packed',p_table,scope_sql,cursor_sql,order_sql,p_limit,replace(order_sql,'t.','p.'),has_created,key_col);
  EXECUTE q INTO result; RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.backup_export_page(text,uuid,timestamptz,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.backup_export_page(text,uuid,timestamptz,text,integer) TO service_role;

DROP POLICY IF EXISTS "Users can view quote items by role" ON public.quote_items;
CREATE POLICY "Users can view quote items by role" ON public.quote_items FOR SELECT TO authenticated USING (public.is_approved() AND (public.is_admin() OR public.is_gestor() OR public.is_quote_owner(quote_id)));
DROP POLICY IF EXISTS "Users can update quote items by role" ON public.quote_items;
CREATE POLICY "Users can update quote items by role" ON public.quote_items FOR UPDATE TO authenticated USING (public.is_approved() AND (public.is_admin() OR public.is_gestor() OR public.is_quote_owner(quote_id))) WITH CHECK (public.is_approved() AND (public.is_admin() OR public.is_gestor() OR public.is_quote_owner(quote_id)));
DROP POLICY IF EXISTS "Users can delete quote items by role" ON public.quote_items;
CREATE POLICY "Users can delete quote items by role" ON public.quote_items FOR DELETE TO authenticated USING (public.is_approved() AND (public.is_admin() OR public.is_gestor() OR public.is_quote_owner(quote_id)));