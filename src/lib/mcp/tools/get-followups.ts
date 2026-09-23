import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { runShared } from "../_bridge";

export default defineTool({
  name: "get_followups",
  title: "Follow-ups pendentes",
  description: "Retorna clientes sem interação recente (default: 30 dias) para follow-up.",
  inputSchema: {
    days_without_contact: z.number().int().min(1).max(365).default(30),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => runShared("get_followups", args, ctx),
});
