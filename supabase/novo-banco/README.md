# Novo banco de dados (Supabase)

Como criar do zero, num projeto Supabase novo, o banco que este CRM usa hoje.

## O que a análise encontrou

- **As 220 migrations de `supabase/migrations` recriam o schema inteiro.** Aplicadas em ordem num
  Postgres vazio, rodam sem erro e produzem exatamente as 71 tabelas que o app espera
  (`src/integrations/supabase/types.ts`), com as funções, triggers, policies e RLS ligado em
  todas elas.
- **O projeto original tem coisas que não estão nas migrations**. Elas estão em `01_complementos.sql` e `02_agendamentos.sql`:
  - 6 buckets de storage que o app usa: `contracts`, `technical-cloud`, `budget-proofs`,
    `help-thumbnails`, `contract-signed`, `contract-evidence`. As policies deles estão nas migrations;
    faltava só criar os buckets.
  - Os jobs do `pg_cron`: a extensão é ativada, mas nenhum agendamento foi versionado.
- **As migrations trazem dados da MCI**: equipe de vendas (`salespeople`) e consultores da landing
  de revendas (`reseller_consultants`), estes com IDs de usuários do banco antigo. Se o banco
  novo for de outra empresa, rode `03_limpar_dados_mci.sql`.
- **Uma migration dá admin a `john.flavio@gmail.com`**, mas num banco vazio ela não encontra
  esse e-mail e não faz nada. O que vale é o trigger de cadastro: **o primeiro usuário criado vira admin
  aprovado**, e os seguintes ficam pendentes de aprovação.
- `get_commercial_summary` existe no banco atual e em nenhuma migration, mas nada no código a
  chama, então não faz falta.

## Passo a passo

### 1. Criar o projeto

No [Supabase](https://supabase.com/dashboard), crie um projeto novo (região **South America (São Paulo)**).
Anote o **Project ref** (o código na URL), a **Project URL** e as chaves em *Settings > API Keys*.

### 2. Aplicar as migrations (escolha um jeito)

**A) Pelo CLI (recomendado).** Não precisa de Docker para isso:

```bash
npx supabase login
```

```bash
npx supabase link --project-ref SEU_PROJECT_REF
```

```bash
npx supabase db push
```

**B) Pelo SQL Editor.** Gere as partes e cole uma de cada vez, em ordem:

```bash
node supabase/novo-banco/juntar-migrations.mjs
```

Isso cria `supabase/novo-banco/saida/parte-01.sql` até `parte-04.sql`. Cada parte é uma transação:
se der erro, nada daquela parte fica aplicado, e dá para rodar de novo depois de corrigir. As partes
registram as migrations no mesmo histórico do CLI, então um `db push` futuro não as reaplica.

### 3. Rodar os scripts desta pasta no SQL Editor

| Ordem | Arquivo | Quando |
|---|---|---|
| 1 | `01_complementos.sql` | Sempre. Cria os buckets que faltam. |
| 2 | `02_agendamentos.sql` | Sempre, **depois de preencher** a URL e a chave service_role no topo. |
| 3 | `03_limpar_dados_mci.sql` | Só se o banco for de outra empresa. |
| 4 | `99_verificacao.sql` | No fim. Todas as linhas devem vir com `ok`. |

Todos podem ser rodados mais de uma vez. Os horários em `02_agendamentos.sql` são uma sugestão:
lembretes de demonstração 1x ao dia, follow-ups a cada 15 min e Loja Integrada a cada 30 min.
Se tiver acesso ao banco antigo, confira os reais com `select jobname, schedule, command from cron.job;`.

### 4. Autenticação

Em *Authentication > URL Configuration*:
- **Site URL**: o endereço onde o app vai rodar.
- **Redirect URLs**: o mesmo endereço e `http://localhost:8081` para desenvolvimento (a 8080 é usada pelo Fortes ERP nesta máquina).

Depois crie o seu usuário (tela de cadastro do app ou *Authentication > Users > Add user*).
**Ele precisa ser o primeiro**, porque é o que vira admin.

### 5. Edge functions

Publique todas (as regras de `verify_jwt` vêm de `supabase/config.toml`):

```bash
npx supabase functions deploy --project-ref SEU_PROJECT_REF
```

Se o CLI reclamar que o Docker não está rodando, repita com `--use-api`.

No Windows, o plugin que regera `supabase/functions/mcp/index.ts` fica desligado (`vite.config.ts`),
porque lá ele gera uma versão que importa um caminho local (`npm:C:\Users\...`) e quebra a função.
Se esse arquivo aparecer alterado no `git status`, restaure com
`git checkout -- supabase/functions/mcp/index.ts` antes de publicar.

Configure os segredos em *Edge Functions > Secrets*. `SUPABASE_URL`, `SUPABASE_ANON_KEY` e
`SUPABASE_SERVICE_ROLE_KEY` já vêm prontos.

| Segredo | Usado por | Observação |
|---|---|---|
| `LOVABLE_API_KEY` | assistente comercial, comparador, equivalentes, follow-up, scrape de produto, e-mails de assinatura | Chama `ai.gateway.lovable.dev` e `connector-gateway.lovable.dev`. Sem ele, IA e e-mail de assinatura param. |
| `RESEND_API_KEY` | e-mails de assinatura de contrato | Vai junto com o gateway do Lovable. |
| `SIGNATURE_EMAIL_FROM` | e-mails de assinatura | Padrão: `MCI Contratos <onboarding@resend.dev>`. |
| `PUBLIC_SITE_URL` | links de assinatura de contrato | **Defina.** O padrão é `https://mcicrm.online`. |
| `FIREBASE_SERVICE_ACCOUNT` | notificações push | JSON da conta de serviço do projeto Firebase. |
| `NF_WEBHOOK_SECRET` | webhook de nota fiscal | **Defina.** Sem ele, qualquer usuário logado (mesmo pendente de aprovação) pode gravar dados de NF em pedidos. |
| `FIDELIZAPRO_WEBHOOK_URL`, `FIDELIZAPRO_WEBHOOK_SECRET` | integração FidelizaPro | Só se usar. |
| `RESELLER_LANDING_ORIGINS` | landing de cadastro de revendas | Domínios extras, separados por vírgula. |
| `AI_MODEL`, `AI_TIMEOUT_MS`, `AI_MAX_RETRIES` | assistente comercial | Opcionais. |
| `ENVIRONMENT` | push | Opcional; padrão `production`. |

### 6. Apontar o app para o banco novo

- `.env`: troque `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_SUPABASE_PROJECT_ID`,
  e também `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`.
- `supabase/config.toml`: troque `project_id`.
- `.lovable/mcp/manifest.json`: troque o `issuer`, que ainda aponta para o projeto antigo.
- Push: a configuração do Firebase está fixa em `src/lib/firebase.ts` e
  `public/firebase-messaging-sw.js` (projeto `push-mci-crm`). Mantenha-a se o
  `FIREBASE_SERVICE_ACCOUNT` for desse mesmo projeto; se for de outra empresa, troque os dois lados.

## Conferir antes de aplicar

`validacao/` ensaia todo o processo num Postgres que roda dentro do Node (PGlite), sem tocar em
nenhum banco real: aplica as partes, os scripts 01 a 03 (duas vezes, para provar que podem
repetir), roda a verificação e simula os dois primeiros cadastros.

```bash
npm --prefix supabase/novo-banco/validacao install
```

```bash
npm --prefix supabase/novo-banco/validacao run validar
```

Rode de novo sempre que entrar uma migration nova. Limitação: o PGlite não tem `pg_cron` nem
`pg_net`, então os agendamentos são ensaiados com substitutos. No Supabase, confirme com `99_verificacao.sql`.

## Pontos de atenção fora do banco

- **Dependência do Lovable**: IA e e-mail passam pelos gateways do Lovable. Fora dele, é preciso uma
  `LOVABLE_API_KEY` válida ou trocar essas chamadas por provedores diretos (Gemini/OpenAI e Resend).
- **`send-push-notifications`** usa a service role e não confere quem chamou. Basta a chave anon,
  que é pública, para mandar push a qualquer usuário.
- **`loja-integrada` (`auto_sync`)** também aceita a chave anon, que é pública, então qualquer pessoa pode
  disparar a sincronização.
