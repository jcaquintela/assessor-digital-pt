// Pedido de identidade mínima de uma lead antes de escrever.
//
// Caso real (30/08, Iolanda): "Segunda tenho de ligar à lead do fim de semana"
// criou uma tarefa sem ninguém associado. No dia seguinte, ao pedir uma
// mensagem para essa lead, o Afonso não tinha nome, número nem imóvel — e
// escreveu algo genérico. Regra: ou ficamos com o essencial, ou avisamos
// claramente da limitação antes de seguir em frente.

import { TOOL_REGISTRY } from "../../v2/domain.server";
import { isRejection as saIsRejection } from "../../culture/short-answers";
import { foldText } from "@/lib/search/normalize";
import { phoneFromText } from "@/lib/people/resolve-person.server";
import { personNameFromEventText } from "@/lib/people/name-match";
import { PendingRepo } from "./pending-repo.server";
import type { PendingResolver } from "./types";

/** "Não sei", "depois digo", "avança sem isso" — segue sem contacto, com aviso. */
const WITHOUT_RE = /\b(nao sei|ainda nao sei|depois (digo|vejo|logo)|sem nome|sem contacto|avanca|deixa assim|fica assim|nao tenho)\b/;

/** Nome dito em resposta directa ("Maria Manuela", "é a maria manuela"). */
export function leadNameFromAnswer(text: string): string | null {
  const byExtractor = personNameFromEventText(text);
  if (byExtractor) return byExtractor;
  const cleaned = String(text ?? "")
    .replace(/(\+?\d[\d\s.\-/()]{6,20}\d)/g, " ")
    .replace(/^\s*(?:e|é|eh)\s+(?:o|a)\s+/i, " ")
    .replace(/[,.;:]/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter((w) => /^\p{L}[\p{L}'-]*$/u.test(w));
  if (words.length < 1 || words.length > 3) return null;
  if (words.some((w) => w.length < 2)) return null;
  return words
    .map((w) => w.charAt(0).toLocaleUpperCase("pt-PT") + w.slice(1))
    .join(" ");
}

export const leadIdentityPending: PendingResolver = async ({ ctx, supabase, trimmed, pending }) => {
  if (!pending || pending.intent !== "confirm_event_person") return null;
  const payload = (pending.structured_payload ?? {}) as Record<string, any>;
  if (payload.mode !== "lead_identity" && payload.mode !== "period_none") return null;

  const toolName = String(payload.tool ?? "create_follow_up");
  const exec = (TOOL_REGISTRY as any)[toolName];
  const incoming = payload.incoming ?? null;
  if (!exec || !incoming) return null;

  const runTool = async (personId: string | null) => {
    const result = await exec(
      { ...ctx, skipPersonResolution: true, skipDuplicateCheck: true },
      { ...incoming, person_id: personId },
    );
    const createdId =
      (result.data as any)?.follow_up?.id ?? (result.data as any)?.event?.id ?? (result.data as any)?.id ?? null;
    await PendingRepo.markStatus(supabase, pending.id, result.ok ? "executed" : "failed", {
      created_resource_type: result.ok ? "follow_up" : null,
      created_resource_id: result.ok ? createdId : null,
      error_message: result.ok ? null : (result.error ?? "not_created"),
    });
    return result;
  };

  const folded = foldText(trimmed);

  // O consultor não quer (ou não pode) dar o nome agora: criamos na mesma,
  // mas dizemos exactamente o que fica por fazer.
  if (WITHOUT_RE.test(folded) || saIsRejection(trimmed)) {
    const result = await runTool(null);
    if (!result.ok) {
      return { reply: "Tentei guardar isso agora e não consegui. Queres que tente outra vez?" };
    }
    return {
      reply:
        "Fica registado sem contacto associado. Só um aviso: sem nome nem número não vou conseguir preparar mensagens nem fazer seguimento dessa lead — quando souberes, diz-me.",
    };
  }

  const name = leadNameFromAnswer(trimmed);
  const phone = phoneFromText(trimmed);
  if (!name && !phone) return null;

  const created = await TOOL_REGISTRY.create_person(ctx, {
    name: name ?? "Contacto novo",
    phone: phone ?? null,
    relationship_type: "potencial_cliente",
  });
  const personId = (created.data as any)?.person?.id ?? (created.data as any)?.id ?? null;
  if (!created.ok || !personId) {
    return { reply: "Tentei criar o contacto e não consegui. Podes repetir o nome e o número?" };
  }
  const result = await runTool(personId);
  if (!result.ok) {
    return { reply: "Criei o contacto, mas não consegui guardar a tarefa. Queres que tente outra vez?" };
  }
  return {
    reply: phone
      ? `Certo — guardei ${name ?? "o contacto"} com o ${phone} e liguei a tarefa a ele.`
      : `Certo — guardei ${name} e liguei a tarefa a ele. Quando tiveres o número, diz-me.`,
  };
};
