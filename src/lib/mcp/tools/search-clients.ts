import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { runShared } from "../_bridge";

export default defineTool({
  name: "search_clients",
  title: "Buscar clientes",
  description: "Busca clientes por nome, empresa, e-mail, telefone, cidade, CNPJ ou CPF respeitando permissões (RLS).",
  inputSchema: {
    query: z.string().min(1).describe("Termo de busca"),
    limit: z.number().int().min(1).max(50).default(20),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => runShared("search_clients", args, ctx),
});
