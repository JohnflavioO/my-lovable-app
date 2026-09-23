import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { runShared } from "../_bridge";

export default defineTool({
  name: "get_products",
  title: "Listar produtos",
  description: "Lista produtos do catálogo MCI visíveis ao usuário autenticado.",
  inputSchema: {
    search: z.string().optional().describe("Filtro por nome/SKU/marca"),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => runShared("search_products", args, ctx),
});
