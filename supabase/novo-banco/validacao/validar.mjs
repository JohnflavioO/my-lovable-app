// Ensaia a criação do banco novo num Postgres vazio (PGlite, roda dentro do Node),
// na mesma ordem do README: partes das migrations -> 01 -> 02 -> 03 -> 99.
//
//   cd supabase/novo-banco/validacao && npm install && npm run validar
//
// Termina com código 1 se qualquer passo falhar ou se a verificação apontar falta.
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const kit = path.resolve(here, '..');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');

// PGlite não tem pg_cron nem pg_net; a base traz substitutos para eles.
const withoutUnavailableExtensions = (sql) =>
  sql.replace(/CREATE EXTENSION IF NOT EXISTS pg_(cron|net)\b[^;]*;/gi, '-- (extensão ignorada no ensaio)');

execFileSync(process.execPath, [path.join(kit, 'juntar-migrations.mjs')], { stdio: 'inherit' });
const parts = fs.readdirSync(path.join(kit, 'saida')).filter((f) => f.endsWith('.sql')).sort();

const db = new PGlite({ extensions: { pg_trgm, pgcrypto, uuid_ossp } });
await db.exec(read(here, 'supabase-base.sql'));

const agendamentos = read(kit, '02_agendamentos.sql')
  .replace('<<< https://SEU-PROJETO.supabase.co >>>', 'https://exemplo.supabase.co')
  .replace('<<< SERVICE_ROLE_KEY >>>', 'chave-de-teste');

const steps = [
  ...parts.map((p) => [`saida/${p}`, read(kit, 'saida', p)]),
  ['01_complementos.sql', read(kit, '01_complementos.sql')],
  ['02_agendamentos.sql', agendamentos],
  ['01_complementos.sql (2a vez)', read(kit, '01_complementos.sql')],
  ['02_agendamentos.sql (2a vez)', agendamentos],
  ['03_limpar_dados_mci.sql', read(kit, '03_limpar_dados_mci.sql')],
];

let failed = false;
for (const [name, sql] of steps) {
  try {
    await db.exec(withoutUnavailableExtensions(sql));
    console.log(`ok    ${name}`);
  } catch (e) {
    failed = true;
    console.log(`ERRO  ${name}: ${e.message}`);
    await db.exec('ROLLBACK').catch(() => {});
  }
}

// O script 02 precisa recusar rodar sem os valores preenchidos.
try {
  await db.exec(withoutUnavailableExtensions(read(kit, '02_agendamentos.sql')));
  failed = true;
  console.log('ERRO  02_agendamentos.sql rodou sem project_url/service_role_key preenchidos');
} catch {
  console.log('ok    02_agendamentos.sql recusa rodar sem os valores preenchidos');
}

const { rows } = await db.query(read(kit, '99_verificacao.sql'));
// Só existem no Supabase de verdade; o ensaio cobre os jobs pelos substitutos.
const knownGaps = (r) => ['pg_cron', 'pg_net'].includes(r.item) || r.tipo === 'agendamento';
const missing = rows.filter((r) => r.status !== 'ok' && !knownGaps(r));
const jobs = (await db.query('SELECT jobname FROM cron.job ORDER BY jobname')).rows.map((r) => r.jobname);
const okCount = rows.filter((r) => r.status === 'ok').length;
const onlyOnSupabase = rows.filter((r) => r.status !== 'ok' && knownGaps(r)).length;
console.log(`\nverificação: ${okCount}/${rows.length} ok; ${onlyOnSupabase} só dá para conferir no Supabase (pg_cron/pg_net e jobs)`);
console.log(`jobs agendados: ${jobs.join(', ')}`);
for (const r of missing) console.log(`FALTANDO  ${r.tipo}: ${r.item}`);
if (missing.length || jobs.length !== 3) failed = true;

// O primeiro usuário a entrar vira admin aprovado; os seguintes ficam pendentes.
await db.exec(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-00000000a001', 'primeiro@exemplo.com', '{"full_name":"Primeiro"}')`);
await db.exec(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-00000000a002', 'segundo@exemplo.com', '{"full_name":"Segundo"}')`);
const { rows: access } = await db.query(`
  SELECT p.email, a.status, coalesce(string_agg(r.role::text, ','), '-') AS roles
  FROM public.profiles p
  JOIN public.user_approvals a ON a.user_id = p.user_id
  LEFT JOIN public.user_roles r ON r.user_id = p.user_id
  GROUP BY p.email, a.status ORDER BY p.email`);
console.table(access);
const first = access.find((a) => a.email === 'primeiro@exemplo.com');
const second = access.find((a) => a.email === 'segundo@exemplo.com');
if (first?.status !== 'approved' || !first.roles.includes('admin') || second?.status !== 'pending') {
  failed = true;
  console.log('ERRO  cadastro inicial não gerou admin/pendente como esperado');
}

const leftovers = (await db.query(`SELECT
  (SELECT count(*) FROM public.salespeople)::int AS vendedores,
  (SELECT string_agg(consultant_code, ',') FROM public.reseller_consultants) AS consultores`)).rows[0];
console.log('dados de exemplo após 03:', leftovers);
if (leftovers.vendedores !== 0 || leftovers.consultores !== 'none') failed = true;

console.log(failed ? '\nFALHOU' : '\nTUDO CERTO');
process.exit(failed ? 1 : 0);
