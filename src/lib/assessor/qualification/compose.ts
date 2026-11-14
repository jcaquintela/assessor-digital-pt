// Resposta única de qualificação: ação feita + perguntas agrupadas.
//
// Uma só mensagem por turno. Nunca anuncia contactos a terceiros: as
// tarefas do plano são do consultor ("confirmas", "marcas").

import {
  daysUntil, isUrgent, missingMinimum, type BriefChange, type BuyerBrief,
} from "./buyer-brief";
import { formatProposal, rankProposals, type ListingProposal } from "./proposal-format";
import { REDE_NO_ACCESS_REPLY } from "./url-provenance";

/** Marca a primeira linha: serve para reconhecer a continuação da conversa. */
export const QUALIFICATION_MARKER = "*Pesquisa para ";
export const MAX_QUESTIONS = 3;

export function isQualificationReply(text: string | null | undefined): boolean {
  return String(text ?? "").startsWith(QUALIFICATION_MARKER);
}

export type PortalStatus = "ok" | "rate_limited" | "failed" | "not_run";

const eur = (n: number) => `${Math.round(n).toLocaleString("pt-PT")} €`;
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function header(b: BuyerBrief): string {
  const who = b.buyerName?.value ?? "o comprador";
  return `${QUALIFICATION_MARKER}${who}*`;
}

function confirmedLine(b: BuyerBrief): string | null {
  const parts: string[] = [];
  if (b.typology) parts.push(b.typology.value);
  else if (b.propertyType) parts.push(b.propertyType.value);
  if (b.zone) parts.push(b.zone.value);
  if (b.nearMetro?.value) parts.push("perto do metro");
  if (b.budgetMax?.status === "confirmed") parts.push(`até ${eur(b.budgetMax.value)}`);
  if (b.financingApproved) parts.push(`pré-aprovação ${eur(b.financingApproved.value)}`);
  if (b.ownFunds) parts.push(`${eur(b.ownFunds.value)} de capitais`);
  if (b.deadline) parts.push(`prazo ${ddmm(b.deadline.value)}`);
  return parts.length ? `Confirmado: ${parts.join(", ")}.` : null;
}

function assumedLine(b: BuyerBrief): string | null {
  if (b.budgetMax?.status !== "assumed") return null;
  return `Assumido: teto de *${eur(b.budgetMax.value)}* (${b.budgetMax.note}). Corrige-me se não for assim.`;
}

function changesLine(changes: BriefChange[]): string | null {
  if (!changes.length) return null;
  const label: Record<string, string> = {
    typology: "tipologia", propertyType: "tipo", zone: "zona", budgetMax: "orçamento",
    financingApproved: "pré-aprovação", ownFunds: "capitais", deadline: "prazo", buyerName: "nome", nearMetro: "metro",
  };
  return `Atualizei: ${changes.map((c) => `${label[c.field] ?? c.field} ${c.from} → ${c.to}`).join("; ")}.`;
}

/** Perguntas que ainda faltam, sem repetir o que já foi perguntado. */
export function pendingQuestions(b: BuyerBrief, alreadyAsked: string): string[] {
  const asked = String(alreadyAsked ?? "");
  const out: string[] = [];
  const miss = missingMinimum(b);
  if (miss.includes("typology")) out.push("Que tipologia (T0, T1, T2…)?");
  if (miss.includes("zone")) out.push("Que zona?");
  if (miss.includes("budget")) out.push("Orçamento aproximado, ou o valor da pré-aprovação?");
  if (!miss.length) {
    if (!b.financingApproved && b.budgetMax?.status === "confirmed") out.push("Já tem pré-aprovação ou crédito em curso?");
    if (!b.deadline) out.push("Há prazo para comprar?");
    out.push("Algo obrigatório (garagem, elevador, varanda)?");
  }
  return out.filter((q) => !asked.includes(q)).slice(0, MAX_QUESTIONS);
}

function urgencyBlock(b: BuyerBrief, now: Date): string | null {
  if (!isUrgent(b, now) || !b.deadline) return null;
  const n = daysUntil(b.deadline.value, now);
  const steps = [
    b.financingApproved ? "- Confirmas com o banco a validade da pré-aprovação" : "- Confirmas o financiamento com o banco",
    "- Marcas visitas esta semana aos que encaixam",
    "- Mandas-me referências ZMPT da Rede e eu cruzo com estes critérios",
  ];
  return `*Prioridade alta: prazo ${ddmm(b.deadline.value)}, faltam ${n} dias.* Em paralelo:\n${steps.join("\n")}`;
}

export interface ComposeInput {
  brief: BuyerBrief;
  changes: BriefChange[];
  internal: ListingProposal[];
  portal: ListingProposal[];
  portalStatus: PortalStatus;
  previousReply?: string | null;
  now?: Date;
}

export function composeQualificationReply(i: ComposeInput): string {
  const now = i.now ?? new Date();
  const b = i.brief;
  const parts: string[] = [header(b)];
  const changed = changesLine(i.changes);
  if (changed) parts.push(changed);
  const conf = confirmedLine(b);
  if (conf) parts.push(conf);
  const ass = assumedLine(b);
  if (ass) parts.push(ass);

  const questions = pendingQuestions(b, i.previousReply ?? "");
  if (missingMinimum(b).length) {
    parts.push(`Para arrancar já a pesquisa só me falta:\n${questions.map((q) => `- ${q}`).join("\n")}\nResponde tudo numa mensagem.`);
    return parts.join("\n\n");
  }

  const urgent = urgencyBlock(b, now);
  if (urgent) parts.push(urgent);

  const internal = rankProposals(i.internal).slice(0, 3);
  const portal = rankProposals(i.portal).slice(0, 5);
  let n = 0;
  const fmt = (list: ListingProposal[]) =>
    list.map((p) => formatProposal(p, ++n)).filter((x): x is string => !!x).join("\n\n");

  const internalTxt = fmt(internal);
  parts.push(internalTxt ? `Na tua carteira:\n${internalTxt}` : "Na tua carteira não há nada que encaixe agora.");

  if (i.portalStatus === "ok") {
    const portalTxt = fmt(portal);
    parts.push(portalTxt
      ? `Nos portais (anúncios publicados; disponibilidade por confirmar):\n${portalTxt}`
      : "Nos portais não encontrei anúncios que encaixem agora. Prefiro dizer-te isso do que inventar.");
  } else if (i.portalStatus === "rate_limited") {
    parts.push("Já fiz as pesquisas de mercado de hoje; amanhã volto aos portais.");
  } else if (i.portalStatus === "failed") {
    parts.push("A pesquisa nos portais falhou agora. Não te mostro anúncios que não consegui confirmar.");
  }

  if (b.refs.length || b.links.length) {
    const items = [...b.refs, ...b.links].slice(0, 5).map((r) => `- ${r}`).join("\n");
    parts.push(`Referências que me deste (ainda por analisar — diz-me preço e tipologia de cada uma e eu cruzo):\n${items}`);
  } else {
    parts.push(REDE_NO_ACCESS_REPLY);
  }

  if (questions.length) parts.push(`Para afinar, de uma vez:\n${questions.map((q) => `- ${q}`).join("\n")}`);
  return parts.join("\n\n");
}
