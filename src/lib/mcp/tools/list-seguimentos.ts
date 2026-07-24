import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { seguimentosSeed, pessoasSeed } from "@/lib/demo-data";

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
  handler: ({ escopo }) => {
    const now = new Date();
    const inWeek = (d: Date) => {
      const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 7;
    };
    const filtered = seguimentosSeed.filter((s) => {
      const d = new Date(s.data);
      switch (escopo) {
        case "hoje": return s.estado !== "Concluído" && sameDay(d, now);
        case "semana": return s.estado !== "Concluído" && inWeek(d);
        case "atrasados": return s.estado !== "Concluído" && d < now && !sameDay(d, now);
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