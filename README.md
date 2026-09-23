# MCI Proposta CRM

CRM comercial da MCI: propostas, clientes, produtos, financeiro, logística, suporte técnico e contratos.
React + Vite + TypeScript + Tailwind no front; Supabase (Postgres, Auth, Storage, Edge Functions) no back.

## Rodar localmente

```bash
npm install
```

```bash
npm run dev
```

Abre em http://localhost:8081 (a 8080 fica livre para outros serviços da máquina).
O `.npmrc` já liga `legacy-peer-deps`, necessário por causa de `react-day-picker@8` com `date-fns@4`.

## Deploy na Vercel

O projeto já vem configurado (`vercel.json`):
- instala com `npm ci`, compila com `npm run build` e publica `dist/`;
- reescreve as rotas do React Router para `index.html` (recarregar `/quotes` não dá 404);
- cache longo para `/assets/*` e nenhum cache para os service workers.

Passos:
1. Em [vercel.com/new](https://vercel.com/new), importe este repositório. O framework é detectado como **Vite**.
2. As variáveis `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_SUPABASE_PROJECT_ID` vêm do
   `.env` versionado (só a chave pública `anon`). Para usar outro projeto Supabase, defina-as em
   *Settings > Environment Variables* da Vercel; elas têm prioridade sobre o `.env`.
3. Depois do primeiro deploy, no Supabase (*Authentication > URL Configuration*), coloque a URL da Vercel
   em **Site URL** e em **Redirect URLs** (`https://SEU-APP.vercel.app/**`). Sem isso, confirmação de
   e-mail e troca de senha redirecionam para o endereço errado.
4. Em *Edge Functions > Secrets*, defina `PUBLIC_SITE_URL` com a mesma URL (links de assinatura de contrato).

## Banco de dados

- Migrations: `supabase/migrations` (aplicar com `npx supabase db push`).
- Criar o banco do zero em outro projeto: veja [supabase/novo-banco/README.md](supabase/novo-banco/README.md).
- Edge functions: `npx supabase functions deploy --project-ref SEU_REF --use-api`.
