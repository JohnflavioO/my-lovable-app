// Junta supabase/migrations em poucos arquivos para colar no SQL Editor do Supabase.
//
//   node supabase/novo-banco/juntar-migrations.mjs
//
// Gera supabase/novo-banco/saida/parte-01.sql, parte-02.sql, ... na ordem certa.
// Cada parte é uma transação: se algo falhar, nada daquela parte fica aplicado.
// Cada migration também é registrada em supabase_migrations.schema_migrations,
// a mesma tabela do `supabase db push`, para o CLI não reaplicar depois.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', 'migrations');
const outDir = path.join(here, 'saida');
// O SQL Editor começa a travar com textos muito grandes; 150 KB por parte é folgado.
const MAX_BYTES = 150_000;

const HISTORY_TABLE = `CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);
`;

const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const parts = [];
let current = [];
let size = 0;
for (const file of files) {
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  const bytes = Buffer.byteLength(sql);
  if (current.length && size + bytes > MAX_BYTES) {
    parts.push(current);
    current = [];
    size = 0;
  }
  current.push({ file, sql });
  size += bytes;
}
if (current.length) parts.push(current);

const quote = (s) => `'${s.replaceAll("'", "''")}'`;
parts.forEach((part, i) => {
  const n = String(i + 1).padStart(2, '0');
  const first = part[0].file.slice(0, 14);
  const last = part.at(-1).file.slice(0, 14);
  let out = `-- Parte ${n} de ${String(parts.length).padStart(2, '0')}: migrations ${first} a ${last} (${part.length} arquivos)\n`;
  out += `-- Gerado por supabase/novo-banco/juntar-migrations.mjs. Rode as partes em ordem.\n\n`;
  out += `BEGIN;\n\n${HISTORY_TABLE}\n`;
  for (const { file, sql } of part) {
    const [version, ...rest] = file.replace(/\.sql$/, '').split('_');
    out += `-- ===== ${file} =====\n${sql.trimEnd()}\n;\n`;
    out += `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES (${quote(version)}, ${quote(rest.join('_'))}) ON CONFLICT (version) DO NOTHING;\n\n`;
  }
  out += 'COMMIT;\n';
  const target = path.join(outDir, `parte-${n}.sql`);
  fs.writeFileSync(target, out);
  console.log(`${path.relative(process.cwd(), target)}  ${part.length} migrations  ${(Buffer.byteLength(out) / 1024).toFixed(0)} KB`);
});
console.log(`\n${files.length} migrations em ${parts.length} partes.`);
