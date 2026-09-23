-- =============================================================================
-- Verificação: rodar no final. Não altera nada, só lista o que falta.
-- Resultado esperado: todas as linhas com status 'ok'.
-- =============================================================================

WITH
expected_tables(name) AS (VALUES
  ('app_changelog'), ('assistant_audit_log'), ('assistant_conversations'), ('assistant_messages'),
  ('bank_slip_history'), ('bank_slips'), ('clients'), ('cnpj_lookup_cache'),
  ('contract_signature_events'), ('contract_signature_requests'), ('contract_templates'),
  ('equivalence_search_cache'), ('equivalence_search_history'), ('financial_action_history'),
  ('financial_import_batches'), ('financial_records'), ('followup_notification_logs'),
  ('generated_contracts'), ('help_videos'), ('import_logs'), ('integrations'),
  ('logistics_action_history'), ('logistics_item_status'), ('logistics_records'), ('notifications'),
  ('password_reset_log'), ('product_equivalences'), ('product_external_links'),
  ('product_relationships'), ('products'), ('profiles'), ('quote_freight_quotes'), ('quote_items'),
  ('quote_messages'), ('quote_payment_audit'), ('quote_recycle_requests'), ('quotes'),
  ('reseller_consultant_history'), ('reseller_consultants'), ('reseller_rate_limit'),
  ('reseller_registration_history'), ('reseller_registrations'), ('salespeople'),
  ('smart_opportunities'), ('sync_execution_logs'), ('system_settings'), ('task_activities'),
  ('task_boards'), ('task_checklists'), ('task_columns'), ('task_comments'), ('tasks'),
  ('technical_brands'), ('technical_budget_versions'), ('technical_budgets'), ('technical_clients'),
  ('technical_cloud_files'), ('technical_maintenances'), ('technical_order_parts'),
  ('technical_orders'), ('technical_products'), ('technical_purchase_order_items'),
  ('technical_purchase_orders'), ('technical_services'), ('technical_status_history'),
  ('technical_suppliers'), ('user_approvals'), ('user_permissions'), ('user_preferences'),
  ('user_push_tokens'), ('user_roles')
),
-- Funções chamadas pelo app via supabase.rpc(...)
expected_rpcs(name) AS (VALUES
  ('admin_get_user_permissions'), ('admin_set_user_permissions'), ('delete_quote_cascade'),
  ('diagnose_product_search'), ('generate_quote_number'), ('get_current_user_access'),
  ('get_default_origin_cep'), ('get_public_logistics_tracking'), ('get_public_technical_tracking'),
  ('get_team_dashboard_recent_quotes'), ('get_team_dashboard_sellers'),
  ('get_team_dashboard_top_clients'), ('list_reseller_assignable_users'),
  ('list_reseller_registrations_summary'), ('log_quote_payment_block'),
  ('log_reseller_registration_view'), ('process_smart_opportunities_diagnostics'),
  ('public_quote_action'), ('set_default_origin_cep'), ('set_reseller_registration_status'),
  ('start_presale_logistics'), ('transfer_reseller_registration_portfolio'),
  ('generate_technical_os_number'), ('search_product_candidates'), ('reseller_rate_limit_hit')
),
expected_buckets(name) AS (VALUES
  ('avatars'), ('quote-pdfs'), ('nf-pdfs'), ('contracts'), ('technical-cloud'),
  ('budget-proofs'), ('help-thumbnails'), ('contract-signed'), ('contract-evidence')
),
expected_extensions(name) AS (VALUES ('pg_trgm'), ('pgcrypto'), ('pg_cron'), ('pg_net')),
expected_realtime(name) AS (VALUES
  ('notifications'), ('quote_messages'), ('reseller_registrations'), ('reseller_registration_history')
),
expected_cron(name) AS (VALUES
  ('demonstration-reminders'), ('scan-followups'), ('loja-integrada-auto-sync')
),
checks AS (
  SELECT 'tabela' AS tipo, e.name AS item,
         EXISTS (SELECT 1 FROM pg_tables t WHERE t.schemaname = 'public' AND t.tablename = e.name) AS ok
  FROM expected_tables e
  UNION ALL
  SELECT 'rls desligado', t.tablename, false
  FROM pg_tables t
  WHERE t.schemaname = 'public' AND NOT t.rowsecurity
  UNION ALL
  SELECT 'funcao rpc', e.name,
         EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = e.name)
  FROM expected_rpcs e
  UNION ALL
  SELECT 'bucket', e.name, EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id = e.name)
  FROM expected_buckets e
  UNION ALL
  SELECT 'extensao', e.name, EXISTS (SELECT 1 FROM pg_extension x WHERE x.extname = e.name)
  FROM expected_extensions e
  UNION ALL
  SELECT 'realtime', e.name,
         EXISTS (SELECT 1 FROM pg_publication_tables pt
                 WHERE pt.pubname = 'supabase_realtime' AND pt.schemaname = 'public' AND pt.tablename = e.name)
  FROM expected_realtime e
  UNION ALL
  SELECT 'trigger', 'auth.users -> on_auth_user_created',
         EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND tgname = 'on_auth_user_created')
  UNION ALL
  SELECT 'segredo vault', s.name, EXISTS (SELECT 1 FROM vault.secrets v WHERE v.name = s.name)
  FROM (VALUES ('project_url'), ('service_role_key')) s(name)
  UNION ALL
  SELECT 'agendamento', e.name,
         to_regclass('cron.job') IS NOT NULL
         AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
         AND (xpath('/row/n/text()',
               query_to_xml(format('SELECT count(*) AS n FROM cron.job WHERE jobname = %L', e.name), false, true, ''))
             )[1]::text::int > 0
  FROM expected_cron e
)
SELECT tipo, item, CASE WHEN ok THEN 'ok' ELSE 'FALTANDO' END AS status
FROM checks
ORDER BY ok, tipo, item;
