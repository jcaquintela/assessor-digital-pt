import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { pessoasSeed } from "@/lib/demo-data";
import { foldText } from "@/lib/search/normalize";
import { NOT_AUTHENTICATED, isSignedIn } from "../require-auth";

export default defineTool({
  name: "list_pessoas",
  title: "Listar pessoas",
  description: "Devolve a lista de pessoas (clientes, potenciais, proprietários) do assessor com nome, contactos, relação e resumo.",
  inputSchema: {
    query: z.string().optional().describe("Filtro opcional por nome, email ou resumo."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ query }, ctx) => {
    if (!isSignedIn(ctx)) return NOT_AUTHENTICATED;
    const q = foldText(query ?? "");
    const items = q
      ? pessoasSeed.filter((p) =>
          [p.nome, p.email, p.resumo].some((f) => foldText(f).includes(q)),
        )
      : pessoasSeed;
    return {
      content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
      structuredContent: { count: items.length, items },
    };
  },
});