import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { runShared } from "../_bridge";

export default defineTool({
  name: "get_tasks",
  title: "Listar tarefas",
  description: "Lista tarefas do usuário autenticado, com filtro opcional de status.",
  inputSchema: {
    status: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => runShared("get_tasks", args, ctx),
});
