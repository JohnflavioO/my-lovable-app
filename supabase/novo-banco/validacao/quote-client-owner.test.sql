-- Run with administrative SQL access. All fixtures and writes are rolled back.
BEGIN;
CREATE TEMP TABLE quote_client_owner_test (client_id uuid, company_id uuid);
CREATE TRIGGER quote_client_owner_test
BEFORE INSERT OR UPDATE ON quote_client_owner_test
FOR EACH ROW EXECUTE FUNCTION public.validate_quote_client_owner();

DO $$
DECLARE
  manager_id uuid;
  company uuid;
  team_client uuid;
  own_client uuid;
  owner_id uuid;
  outsider uuid := gen_random_uuid();
  other_client uuid;
  test_company uuid := gen_random_uuid();
BEGIN
  SELECT r.user_id, p.company_id INTO manager_id, company
  FROM public.user_roles r JOIN public.profiles p ON p.user_id = r.user_id
  WHERE r.role = 'gestor' AND p.company_id IS NOT NULL LIMIT 1;
  IF manager_id IS NULL THEN RAISE EXCEPTION 'Test requires a manager with a company'; END IF;

  SELECT id, created_by INTO team_client, owner_id FROM public.clients
  WHERE company_id = company AND created_by IS NOT NULL AND created_by <> manager_id LIMIT 1;
  IF team_client IS NULL THEN RAISE EXCEPTION 'Test requires a team client owned by someone else'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', manager_id, 'role', 'authenticated')::text, true);
  INSERT INTO quote_client_owner_test VALUES (team_client, company);
  UPDATE quote_client_owner_test SET client_id = team_client;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.clients(name, company_id) VALUES ('Temporary quote ownership test', test_company) RETURNING id INTO other_client;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', manager_id, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO quote_client_owner_test VALUES (other_client, company);
    RAISE EXCEPTION 'FAIL: manager linked a client from another company';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Você só pode vincular orçamentos aos seus próprios clientes' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO quote_client_owner_test VALUES (team_client, test_company);
    RAISE EXCEPTION 'FAIL: manager linked a quote from another company';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Você só pode vincular orçamentos aos seus próprios clientes' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO quote_client_owner_test VALUES (team_client, company);
    RAISE EXCEPTION 'FAIL: ordinary user linked someone else''s client';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Você só pode vincular orçamentos aos seus próprios clientes' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  INSERT INTO quote_client_owner_test VALUES (team_client, company);

  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  BEGIN
    INSERT INTO quote_client_owner_test VALUES (team_client, company);
    RAISE EXCEPTION 'FAIL: anonymous request changed client linkage';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Você só pode vincular orçamentos aos seus próprios clientes' THEN RAISE; END IF;
  END;

  IF (SELECT created_by FROM public.clients WHERE id = team_client) IS DISTINCT FROM owner_id THEN
    RAISE EXCEPTION 'FAIL: client ownership changed';
  END IF;
END;
$$;
ROLLBACK;