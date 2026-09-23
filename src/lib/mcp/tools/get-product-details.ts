import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { runShared } from "../_bridge";

export default defineTool({
  name: "get_product_details",
  title: "Detalhes do produto",
  description: "Retorna os dados completos de um produto do catálogo MCI. Somente leitura.",
  inputSchema: { id: z.string().uuid().describe("UUID do produto MCI") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => runShared("get_product_details", args, ctx),
});
