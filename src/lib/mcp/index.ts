import { defineMcp } from "@lovable.dev/mcp-js";
import listPessoasTool from "./tools/list-pessoas";
import listOportunidadesTool from "./tools/list-oportunidades";
import listSeguimentosTool from "./tools/list-seguimentos";
import briefingHojeTool from "./tools/briefing-hoje";

export default defineMcp({
  name: "assessor-do-consultor-mcp",
  title: "Assessor do Consultor",
  version: "0.1.0",
  instructions:
    "Ferramentas do 'Assessor do Consultor' — assessor pessoal digital para consultores imobiliários. Devolve pessoas, oportunidades, seguimentos e o briefing do dia (dados demo fictícios em PT-PT).",
  tools: [listPessoasTool, listOportunidadesTool, listSeguimentosTool, briefingHojeTool],
});