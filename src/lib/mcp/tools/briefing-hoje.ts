import { defineTool } from "@lovable.dev/mcp-js";
import { isOpenFollowUpStatus } from "@/lib/assessor/outcome-status";
import { seguimentosSeed, oportunidadesSeed, pessoasSeed } from "@/lib/demo-data";

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default defineTool({
  name: "briefing_hoje",
  title: "Briefing de hoje",
  description: "Resumo do dia do consultor: compromissos, tarefas de hoje, atrasados e oportunidades sem próxima ação.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => {
    const now = new Date();
    const eventosHoje = seguimentosSeed.filter(
      (s) => s.tipo === "Evento" && sameDay(new Date(s.data), now) && isOpenFollowUpStatus(s.estado),
    );
    const tarefasHoje = seguimentosSeed.filter(
      (s) => s.tipo === "Tarefa" && sameDay(new Date(s.data), now) && isOpenFollowUpStatus(s.estado),
    );
    const atrasados = seguimentosSeed.filter(
      (s) => isOpenFollowUpStatus(s.estado) && new Date(s.data) < now && !sameDay(new Date(s.data), now),
    );
    const oportunidadesSemAcao = oportunidadesSeed.filter((o) => !o.proximaAcao);
    const briefing = {
      data: now.toISOString().slice(0, 10),
      compromissos: eventosHoje.map((e) => ({ hora: e.hora, titulo: e.titulo, pessoa: pessoasSeed.find((p) => p.id === e.pessoaId)?.nome })),
      tarefas_hoje: tarefasHoje.map((t) => ({ titulo: t.titulo, prioridade: t.prioridade })),
      atrasados: atrasados.length,
      oportunidades_sem_proxima_acao: oportunidadesSemAcao.length,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(briefing, null, 2) }],
      structuredContent: briefing,
    };
  },
});