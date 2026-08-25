// Recibo de escrita — módulo puro (sem I/O).
//
// Uma confirmação tem de dizer o QUÊ e ONDE. "Feito." obriga o consultor a ir
// verificar à mão; e prometer envio ("enviei", "para a equipa") é pior ainda,
// porque descreve uma acção que nunca aconteceu.

import { buildWriteConfirmation, claimsDelivery, isBareAck } from "../culture/confirmations";

interface ToolOutcome {
  name: string;
  ok: boolean;
  data?: unknown;
}

const MAP: Record<string, { object: string; destination: string; titleAt?: string[] }> = {
  create_follow_up: { object: "o seguimento", destination: "Seguimentos", titleAt: ["follow_up", "title"] },
  create_event: { object: "o compromisso", destination: "Calendário", titleAt: ["event", "title"] },
  save_interaction: { object: "a nota", destination: "Interações", titleAt: ["interaction", "summary"] },
  save_miscellaneous: { object: "o registo", destination: "Diversos", titleAt: ["item", "title"] },
  create_person: { object: "o contacto", destination: "Pessoas", titleAt: ["person", "name"] },
  create_property: { object: "o imóvel", destination: "Imóveis", titleAt: ["property", "title"] },
  create_deal: { object: "o negócio", destination: "Negócios", titleAt: ["deal", "title"] },
  create_financial_movement: { object: "o movimento", destination: "Negócio" },
  create_prospecting_lead: { object: "a placa", destination: "Prospeção", titleAt: ["lead", "title"] },
  create_routine: { object: "a rotina", destination: "Rotinas", titleAt: ["routine", "title"] },
};

function pick(data: unknown, path?: string[]): string | null {
  if (!path) return null;
  let cur: any = data;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return null;
    cur = cur[key];
  }
  return typeof cur === "string" && cur.trim() ? cur.trim() : null;
}

/** Constrói "Guardei X 'título' em Y." a partir das ferramentas executadas. */
export function describeWrites(tools: ToolOutcome[]): string | null {
  const parts: string[] = [];
  for (const t of tools) {
    if (!t.ok) continue;
    const spec = MAP[t.name];
    if (!spec) continue;
    parts.push(
      buildWriteConfirmation({
        object: spec.object,
        title: pick(t.data, spec.titleAt),
        destination: spec.destination,
        localOnly: false,
      }),
    );
    if (parts.length >= 2) break;
  }
  return parts.length ? parts.join(" ") : null;
}

/**
 * Última linha de defesa antes de responder: sem "Feito." isolado e sem
 * promessas de envio quando o motor só escreveu localmente.
 */
// Verbos no presente/futuro que descrevem uma escrita JÁ FEITA. "Adiciono a
// Ana Catarina Santos..." lê-se como proposta e provoca um "Sim" inútil do
// consultor (caso real, 25/08). Uma escrita executada fala sempre no passado.
const PRESENT_WRITE_RE =
  /\b(?:vou\s+(?:adicionar|registar|criar|marcar|guardar|atualizar|actualizar|agendar)|adiciono|registo|crio|marco|guardo|atualizo|actualizo|agendo|coloco|ponho|aponto)\b/i;

/** A frase descreve no presente/futuro algo que já foi executado? */
export function promisesFutureWrite(text: string | null | undefined): boolean {
  return PRESENT_WRITE_RE.test(String(text ?? ""));
}

export function enforceTransparentConfirmation(
  reply: string,
  tools: ToolOutcome[],
  opts: { executedOk: boolean },
): string {
  const receipt = describeWrites(tools);
  let out = reply;
  if (claimsDelivery(reply)) out = receipt ?? "Guardei o registo no dashboard. Não enviei nada a ninguém.";
  else if (opts.executedOk && isBareAck(reply) && receipt) out = receipt;
  // Escrita feita, mas contada no presente/futuro: substituímos pelo recibo
  // no passado para não parecer uma proposta à espera de "Sim".
  else if (opts.executedOk && promisesFutureWrite(reply) && receipt) out = receipt;
  return withProspectingHint(out, tools);
}

// Nota leve: onde é que o consultor vê as placas. Não é aviso de limitação,
// é orientação — vale para qualquer plano.
const PROSPECTING_HINT = "Vês esta e as outras em Prospeção, no dashboard.";

function withProspectingHint(reply: string, tools: ToolOutcome[]): string {
  const created = tools.some((t) => t.ok && t.name === "create_prospecting_lead");
  if (!created) return reply;
  if (reply.includes(PROSPECTING_HINT)) return reply;
  const base = reply.trim();
  if (!base) return PROSPECTING_HINT;
  return `${base}${/[.!?…]$/.test(base) ? "" : "."} ${PROSPECTING_HINT}`;
}