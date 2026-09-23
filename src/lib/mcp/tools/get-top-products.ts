import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { runShared } from "../_bridge";

export default defineTool({
  name: "get_top_products",
  title: "Produtos mais vendidos",
  description: "Ranking de produtos mais vendidos considerando apenas orçamentos aprovados. Escolha metric='quantity' para volume ou 'revenue' para faturamento.",
  inputSchema: {
    from: z.string().optional().describe("Data inicial ISO"),
    to: z.string().optional().describe("Data final ISO"),
    days_back: z.number().int().min(1).max(3650).optional(),
    metric: z.enum(["quantity", "revenue"]).default("revenue"),
    brand: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(10),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => runShared("get_top_products", args, ctx),
});
