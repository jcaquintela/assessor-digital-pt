import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { oportunidadesSeed, pessoasSeed } from "@/lib/demo-data";

export default defineTool({
  name: "list_oportunidades",
  title: "Listar oportunidades",
  description: "Devolve as oportunidades do consultor (compra, venda, angariação, etc.) com pessoa associada, estado, valor e próxima ação.",
  inputSchema: {
    estado: z.string().optional().describe("Filtrar por estado exato (ex.: 'Visita', 'Proposta')."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ estado }) => {
    const items = (estado ? oportunidadesSeed.filter((o) => o.estado === estado) : oportunidadesSeed)
      .map((o) => ({
        ...o,
        pessoa: pessoasSeed.find((p) => p.id === o.pessoaId)?.nome,
      }));
    return {
      content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
      structuredContent: { count: items.length, items },
    };
  },
});