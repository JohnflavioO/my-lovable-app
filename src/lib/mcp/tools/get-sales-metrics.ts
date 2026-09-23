import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { runShared } from "../_bridge";

export default defineTool({
  name: "get_sales_metrics",
  title: "Métricas de vendas",
  description: "Retorna métricas de vendas (orçamentos aprovados) em um período: receita total, ticket médio.",
  inputSchema: {
    from: z.string().optional().describe("Data inicial ISO"),
    to: z.string().optional().describe("Data final ISO"),
    days_back: z.number().int().min(1).max(3650).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => runShared("get_sales_metrics", args, ctx),
});
