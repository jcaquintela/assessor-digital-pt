import { defineTool } from "@lovable.dev/mcp-js";
import { isOpenFollowUpStatus } from "@/lib/assessor/outcome-status";
import { z } from "zod";
import { seguimentosSeed, pessoasSeed } from "@/lib/demo-data";
import { NOT_AUTHENTICATED, isSignedIn } from "../require-auth";

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default defineTool({
  name: "list_seguimentos",
  title: "Listar seguimentos",
  description: "Devolve tarefas e eventos do consultor, filtráveis por âmbito temporal.",
  inputSchema: {
    escopo: z
      .enum(["hoje", "semana", "atrasados", "concluidos", "todos"])
      .default("todos")
      .describe("Âmbito temporal do filtro."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ escopo }, ctx) => {
    if (!isSignedIn(ctx)) return NOT_AUTHENTICATED;
    const now = new Date();
    const inWeek = (d: Date) => {
      const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 7;
    };
    const filtered = seguimentosSeed.filter((s) => {
      const d = new Date(s.data);
      switch (escopo) {
        case "hoje": return isOpenFollowUpStatus(s.estado) && sameDay(d, now);
        case "semana": return isOpenFollowUpStatus(s.estado) && inWeek(d);
        case "atrasados": return isOpenFollowUpStatus(s.estado) && d < now && !sameDay(d, now);
        case "concluidos": return s.estado === "Concluído";
        default: return true;
      }
    }).map((s) => ({
      ...s,
      pessoa: s.pessoaId ? pessoasSeed.find((p) => p.id === s.pessoaId)?.nome : undefined,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }],
      structuredContent: { count: filtered.length, items: filtered },
    };
  },
});