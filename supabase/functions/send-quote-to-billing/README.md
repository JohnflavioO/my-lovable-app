# Envio de orçamento ao faturamento

A função é backend-to-backend: o segredo do faturamento nunca deve ser exposto no navegador.

Configure os secrets no projeto Supabase antes de publicar a função:

- `FATURAMENTO_URL=https://faturamentomcit.vercel.app/api/crm-pedido`
- `FATURAMENTO_SECRET=<segredo fornecido pelo sistema de faturamento>`
- `FATURAMENTO_VENDEDORES_JSON={"Nome no CRM":"Nome oficial no faturamento","uuid-do-usuario":"Nome oficial no faturamento"}` (opcional; recomendado para mapear nomes oficiais)
- `CRM_ALLOWED_ORIGIN=https://<dominio-do-crm>` (opcional)

A função exige uma sessão autenticada, valida acesso ao orçamento e envia o PDF Base64. Só grava o bloqueio depois de receber confirmação de criação (HTTP 201/ok:true) ou resposta idempotente HTTP 409. Timeout/erro não bloqueia o orçamento.

## Importante

O sistema de faturamento não documenta atualmente um webhook de retorno para aprovação de solicitações de edição. O CRM pode registrar uma solicitação pendente, mas ela só chegará à equipe do faturamento quando o sistema externo disponibilizar um endpoint de recebimento ou houver um canal operacional definido. Não habilitar desbloqueio automático sem esse contrato.
