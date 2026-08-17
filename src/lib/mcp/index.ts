import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listPessoasTool from "./tools/list-pessoas";
import listOportunidadesTool from "./tools/list-oportunidades";
import listSeguimentosTool from "./tools/list-seguimentos";
import briefingHojeTool from "./tools/briefing-hoje";
import { BRAND_NAME } from "@/lib/brand";

// Emissor OAuth: tem de ser o host directo do Supabase (o proxy é rejeitado).
const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "assessor-do-consultor-mcp",
  title: BRAND_NAME,
  version: "0.1.0",
  instructions:
    `Ferramentas do '${BRAND_NAME}' — assessor pessoal digital para consultores imobiliários. Devolve pessoas, oportunidades, seguimentos e o briefing do dia (dados demo fictícios em PT-PT).`,
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listPessoasTool, listOportunidadesTool, listSeguimentosTool, briefingHojeTool],
});