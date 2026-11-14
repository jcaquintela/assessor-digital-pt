// Resposta única para um negócio em risco: factos vs alegações, contas,
// riscos, próxima melhor ação (ou parar), mensagens e tarefas prontas, estados.

import { formatActionStates, type ActionItem } from "../commercial/action-states";
import { formatMessages, formatTasks } from "../commercial/assisted-execution";
import { costsLine, eur, NOT_BANK_DECISION, summaryLine } from "../commercial/financial-simulator";
import { formatNextAction } from "../commercial/next-best-action";
import { formatRisks } from "../commercial/risk-detector";
import type { DealBrief } from "./deal-brief";
import type { DealPlan } from "./deal-plan";

export const DEAL_MARKER = "*Negócio em risco";
export const isDealReply = (t: string | null | undefined) => String(t ?? "").startsWith(DEAL_MARKER);

export function composeDealReply(b: DealBrief, p: DealPlan, opts: { update?: boolean } = {}): string {
  const parts: string[] = [`${DEAL_MARKER}${b.proposalPrice != null ? ` — proposta ${eur(b.proposalPrice)}` : ""}${opts.update ? " (atualização)" : ""}*`];
  const facts = [
    b.proposalPrice != null ? `proposta ${eur(b.proposalPrice)}` : null,
    b.appraisal != null ? `avaliação ${eur(b.appraisal)}` : null,
    b.ltv != null ? `crédito até ${Math.round(b.ltv * 100)}% do menor valor` : null,
    b.ownFunds != null ? `capitais ${eur(b.ownFunds)}` : null,
    b.loanCap != null ? `pré-aprovação ${eur(b.loanCap)}` : null,
    b.cpcvDate ? `CPCV ${b.cpcvDate.slice(8, 10)}/${b.cpcvDate.slice(5, 7)}` : null,
    b.deposit != null ? `sinal ${eur(b.deposit)}` : null,
    b.age != null ? `comprador com ${b.age} anos` : null,
  ].filter(Boolean);
  if (facts.length) parts.push(`*Confirmado (por ti):* ${facts.join(" · ")}.`);
  if (b.allegedOffer != null) {
    parts.push(`*Por verificar:* outro interessado a ${eur(b.allegedOffer)} (dito pelo ${b.allegedBy ?? "terceiro"}, sem prova) — não entra nas contas. Se precisar de crédito, o banco dele também avalia o imóvel.`);
  }

  if (p.atPrice) {
    const lines = [`*Contas* (${p.atPrice.assumptions.join("; ")}):`, `- ${summaryLine(p.atPrice)}`];
    if (p.atAppraisal) lines.push(`- ${summaryLine(p.atAppraisal, `A ${eur(p.atAppraisal.price)} (valor da avaliação)`)}`);
    if (p.atAppraisalYoung) lines.push(`- ${summaryLine(p.atAppraisalYoung, `Com IMT Jovem, a ${eur(p.atAppraisalYoung.price)}`)}`);
    if (p.maxPrice != null) lines.push(`- Preço máximo que fecha com ${eur(p.atPrice.ownFunds)}: ~${eur(p.maxPrice)}${p.maxPriceYoung != null && p.maxPriceYoung > p.maxPrice ? ` (com IMT Jovem: ~${eur(p.maxPriceYoung)})` : ""}.`);
    lines.push(`Encargos a ${eur(p.atPrice.price)}: ${costsLine(p.atPrice)}.`);
    lines.push(`_${NOT_BANK_DECISION}_`);
    parts.push(lines.join("\n"));
  }

  const risks = formatRisks(p.risks);
  if (risks) parts.push(risks);
  if (p.next) parts.push(formatNextAction(p.next));
  const msgs = formatMessages(p.messages);
  if (msgs) parts.push(msgs);
  const tasks = formatTasks(p.tasks);
  if (tasks) parts.push(tasks);

  const items: ActionItem[] = [];
  const prepared = [p.atPrice ? "contas" : null, p.messages.length ? `${p.messages.length} ${p.messages.length === 1 ? "mensagem" : "mensagens"}` : null, p.tasks.length ? `${p.tasks.length} tarefas` : null].filter(Boolean);
  if (prepared.length) items.push({ state: "prepared", text: prepared.join(", ") });
  items.push({ state: "awaiting_approval", text: `${p.tasks.length ? "gravar as tarefas nos Seguimentos; " : ""}enviar mensagens ao vendedor ou ao comprador — nada sai sem o teu ok` });
  items.push({ state: "no_access", text: "processo no banco, texto do CPCV, prova da outra proposta" });
  parts.push(formatActionStates(items));

  if (p.questions.length) parts.push(`Para afinar, de uma vez:\n${p.questions.map((q) => `- ${q}`).join("\n")}`);
  return parts.join("\n\n");
}
