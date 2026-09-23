import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { runShared } from "../_bridge";

export default defineTool({
  name: "search_products",
  title: "Buscar produtos",
  description: "Busca textual no catálogo MCI por nome, SKU, marca ou descrição.",
  inputSchema: {
    query: z.string().min(1).describe("Termo de busca"),
    limit: z.number().int().min(1).max(50).default(20),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => runShared("search_products", args, ctx),
});
