// Resposta única de qualificação: ação feita + perguntas agrupadas.
//
// Uma só mensagem por turno. Nunca anuncia contactos a terceiros: as
// tarefas do plano são do consultor ("confirmas", "marcas").

import {
  daysUntil, isUrgent, missingMinimum, type BriefChange, type BuyerBrief,
} from "./buyer-brief";
import { formatProposal, rankProposals, type ListingProposal } from "./proposal-format";
import { REDE_NO_ACCESS_REPLY } from "./url-provenance";
import { formatActionStates, type ActionItem } from "../commercial/action-states";
import { formatRisks } from "../commercial/risk-detector";
import { formatNextAction } from "../commercial/next-best-action";
import { formatTasks } from "../commercial/assisted-execution";
import { buyerPlan } from "./buyer-plan";

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
  const fresh = out.filter((q) => !asked.includes(q)).slice(0, MAX_QUESTIONS);
  // O mínimo bloqueia a pesquisa: se ficou por responder, volta-se a pedir
  // (de forma curta), senão a mensagem ficava sem pergunta nenhuma.
  if (!fresh.length && miss.length) {
    const label = { typology: "a tipologia", zone: "a zona", budget: "o orçamento aproximado (ou o valor da pré-aprovação)" };
    return [`Falta só ${miss.map((m) => label[m]).join(" e ")} — com isso pesquiso logo.`];
  }
  return fresh;
}

function urgencyBlock(b: BuyerBrief, now: Date): string | null {
  if (!isUrgent(b, now)) return null;
  const n = b.deadline ? daysUntil(b.deadline.value, now) : null;
  const steps = [
    b.financingApproved ? "- Confirmas com o banco a validade da pré-aprovação" : "- Confirmas o financiamento com o banco",
    "- Marcas visitas esta semana aos que encaixam",
    "- Mandas-me referências ZMPT da Rede e eu cruzo com estes critérios",
  ];
  const head = b.deadline ? `prazo ${ddmm(b.deadline.value)}, faltam ${n} dias` : "urgente, sem data — confirma a data limite";
  return `*Prioridade alta: ${head}.* Em paralelo:\n${steps.join("\n")}`;
}

// Mensagem ao comprador PREPARADA (não pedimos licença para preparar): o
// consultor copia e envia. Só leva links que já estão na resposta.
function buyerMessage(b: BuyerBrief, shown: ListingProposal[]): string | null {
  const withLinks = shown.filter((p) => /^https?:\/\//.test(p.url) && p.source === "portal").slice(0, 2);
  if (!withLinks.length) return null;
  const who = b.buyerName?.value ? `Olá ${b.buyerName.value}` : "Olá";
  const what = [b.typology?.value, b.zone ? `em ${b.zone.value}` : null].filter(Boolean).join(" ");
  const items = withLinks.map((p, n) => `${n + 1}) ${p.title}${p.price != null && !/\d\s*€/.test(p.title) ? `, ${eur(p.price)}` : ""} ${p.url}`).join(" ");
  return `*Mensagem para o comprador (preparada — copias e envias tu):*\n"${who}, separei ${withLinks.length === 1 ? "uma opção" : "duas opções"} ${what} dentro do que falámos: ${items}. Qual queres visitar esta semana?"`;
}

export interface ComposeInput {
  brief: BuyerBrief;
  changes: BriefChange[];
  internal: ListingProposal[];
  portal: ListingProposal[];
  portalStatus: PortalStatus;
  previousReply?: string | null;
  now?: Date;
  /** A carteira própria foi mesmo consultada neste turno. */
  ownSearched?: boolean;
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

  let portalShown = false;
  if (i.portalStatus === "ok") {
    const portalTxt = fmt(portal);
    portalShown = portalTxt.length > 0;
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

  const shownPortal = i.portalStatus === "ok" ? portal : [];
  const msg = buyerMessage(b, shownPortal);
  if (msg) parts.push(msg);

  const plan = buyerPlan(b, now, { hasProposals: internalTxt.length > 0 || portalShown, aboveCeilingOnly: [...internal, ...shownPortal].length > 0 && [...internal, ...shownPortal].every((p) => p.caveats.some((c) => /acima/.test(c))) });
  const risks = formatRisks(plan.risks);
  if (risks) parts.push(risks);
  parts.push(formatNextAction(plan.next) + (!urgent && !b.financingApproved
    ? "\nAtenção: sem pré-aprovação confirmada, uma proposta pode cair — vale a pena pedir já a simulação ao banco." : ""));
  const tasks = formatTasks(plan.tasks);
  if (tasks) parts.push(tasks);

  const items: ActionItem[] = [];
  if (i.ownSearched) items.push({ state: "executed", evidenceTool: "search_properties", text: `procurei na tua carteira (${internal.length} a encaixar)` });
  if (i.portalStatus === "ok") items.push({ state: "executed", evidenceTool: "search_similar_listings", text: `pesquisa nos portais (${i.portal.length} ${i.portal.length === 1 ? "anúncio" : "anúncios"})` });
  items.push({ state: "prepared", text: [b.budgetMax?.status === "assumed" ? "contas do teto" : null, msg ? "mensagem para o comprador" : null, `${plan.tasks.length} tarefas`].filter(Boolean).join(", ") });
  items.push({ state: "awaiting_approval", text: "gravar as tarefas nos Seguimentos; enviar ao comprador ou marcar visitas com terceiros — nada sai sem o teu ok" });
  items.push({ state: "no_access", text: "carteira da Rede/Zome, disponibilidade real dos anúncios dos portais, decisão do banco" });
  parts.push(formatActionStates(items));

  if (questions.length) parts.push(`Para afinar, de uma vez:\n${questions.map((q) => `- ${q}`).join("\n")}`);
  return parts.join("\n\n");
}
