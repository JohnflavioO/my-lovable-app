import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { runShared } from "../_bridge";

export default defineTool({
  name: "list_quotes",
  title: "Listar orçamentos",
  description: "Lista orçamentos do CRM visíveis ao usuário autenticado, opcionalmente filtrados por status.",
  inputSchema: {
    status: z.string().optional().describe("Filtro por status (ex: aprovado, pendente)"),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => runShared("list_quotes", args, ctx),
});
