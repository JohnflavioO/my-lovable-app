import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { runShared } from "../_bridge";

export default defineTool({
  name: "list_clients",
  title: "Listar clientes",
  description: "Lista clientes do CRM visíveis ao usuário autenticado.",
  inputSchema: {
    search: z.string().optional().describe("Filtro por nome/email/telefone"),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => runShared("list_clients", args, ctx),
});
