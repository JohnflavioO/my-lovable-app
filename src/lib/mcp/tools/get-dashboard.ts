import { defineTool } from "@lovable.dev/mcp-js";
import { runShared } from "../_bridge";

export default defineTool({
  name: "get_dashboard",
  title: "Dashboard comercial",
  description: "Retorna métricas resumidas: totais de clientes, orçamentos por status, valor previsto.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => runShared("get_dashboard", args, ctx),
});
