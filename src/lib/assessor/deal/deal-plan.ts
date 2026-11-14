// Negócio em risco: contas, riscos, próxima melhor ação (incluindo PARAR),
// mensagens e tarefas (puro e determinístico).

import {
  DEFAULT_LTV, eur, maxViablePrice, simulatePurchase, type SimInput, type SimResult,
} from "../commercial/financial-simulator";
import { deadlineRisk, type Risk } from "../commercial/risk-detector";
import { ddmmLisbon, plusDays, ymdLisbon, type NextAction } from "../commercial/next-best-action";
import type { PreparedMessage, PreparedTask } from "../commercial/assisted-execution";
import type { DealBrief } from "./deal-brief";

export interface DealPlan {
  canSimulate: boolean;
  atPrice: SimResult | null;
  atAppraisal: SimResult | null;
  atAppraisalYoung: SimResult | null;
  maxPrice: number | null;
  maxPriceYoung: number | null;
  risks: Risk[];
  next: NextAction | null;
  messages: PreparedMessage[];
  tasks: PreparedTask[];
  questions: string[];
  viability: "viable" | "viable_at_appraisal" | "depends_on_young" | "unviable" | "unknown";
}

const k = (n: number) => `${Math.round(n / 1000)}k`;

export function dealPlan(b: DealBrief, now: Date): DealPlan {
  const today = ymdLisbon(now);
  const ltv = b.ltv ?? DEFAULT_LTV;
  const young = b.age != null ? b.age <= 35 : null;
  const risks: Risk[] = [];
  const questions: string[] = [];
  const base: Omit<SimInput, "price"> = {
    appraisal: b.appraisal, ownFunds: b.ownFunds ?? 0, loanCap: b.loanCap, ltv, use: b.use, young,
  };
  const canSimulate = b.proposalPrice != null && b.ownFunds != null;

  if (b.proposalPrice != null && b.appraisal != null && b.appraisal < b.proposalPrice) {
    const d = b.proposalPrice - b.appraisal;
    risks.push({ kind: "appraisal_gap", severity: "alta", evidence: "confirmado", text: `avaliação ${eur(b.appraisal)} abaixo da proposta em ${eur(d)} (${((d / b.proposalPrice) * 100).toFixed(1).replace(".", ",")}%)` });
  }
  const atPrice = canSimulate ? simulatePurchase({ ...base, price: b.proposalPrice! }) : null;
  const atAppraisal = canSimulate && b.appraisal != null && b.appraisal < b.proposalPrice! ? simulatePurchase({ ...base, price: b.appraisal }) : null;
  const atAppraisalYoung = atAppraisal && young == null && (b.use ?? "hpp") === "hpp"
    ? simulatePurchase({ ...base, price: b.appraisal!, young: true }) : null;
  const maxPrice = canSimulate ? maxViablePrice(base) : null;
  const maxPriceYoung = canSimulate && young == null && (b.use ?? "hpp") === "hpp" ? maxViablePrice({ ...base, young: true }) : null;

  if (atPrice && atPrice.gap > 0) {
    risks.push({ kind: "financing_gap", severity: "alta", evidence: "calculado", text: `a ${eur(atPrice.price)} faltam ~${eur(atPrice.gap)} de capitais` });
  }
  const cpcv = deadlineRisk("CPCV", b.cpcvDate, today);
  if (cpcv) risks.push(cpcv);
  const deed = deadlineRisk("escritura", b.deedDate, today);
  if (deed) risks.push(deed);
  if (b.financingClause === false) {
    risks.push({ kind: "cpcv", severity: "alta", evidence: "confirmado", text: "CPCV sem condição de financiamento: se o crédito falhar, o sinal pode perder-se" });
  } else if (b.financingClause == null) {
    risks.push({ kind: "cpcv", severity: "média", evidence: "calculado", text: "condição de financiamento no CPCV por confirmar — define se o sinal fica protegido" });
  }
  if (b.withdrawalSignal) risks.push({ kind: "withdrawal", severity: "alta", evidence: "confirmado", text: "sinais de desistência do comprador" });
  if (b.allegedOffer != null) {
    risks.push({ kind: "alleged_offer", severity: "média", evidence: "alegado", text: `outro interessado a ${eur(b.allegedOffer)} dito pelo ${b.allegedBy ?? "terceiro"}, sem prova` });
  }
  if (b.loanCap != null) risks.push({ kind: "pre_approval", severity: "média", evidence: "confirmado", text: "pré-aprovação não é aprovação final" });

  if (!canSimulate) {
    if (b.proposalPrice == null) questions.push("Qual o valor da proposta?");
    if (b.ownFunds == null) questions.push("Quanto tem o comprador de capitais próprios?");
    if (b.appraisal == null) questions.push("A avaliação do banco já saiu? Em quanto?");
  }

  let viability: DealPlan["viability"] = "unknown";
  let next: NextAction | null = null;
  const who = b.buyerName ? `do ${b.buyerName}` : "do comprador";
  const target = b.appraisal != null && b.proposalPrice != null && b.appraisal < b.proposalPrice ? b.appraisal : null;
  if (atPrice && atPrice.gap <= 0) {
    viability = "viable";
    next = { action: "pedes ao banco a aprovação final e fechas a data do CPCV/escritura", why: `a ${eur(atPrice.price)} as contas fecham (sobram ~${eur(-atPrice.gap)})`, owner: "Tu", due: ddmmLisbon(plusDays(now, 1)) };
  } else if (atPrice) {
    if (atAppraisal && atAppraisal.gap <= 0) {
      viability = "viable_at_appraisal";
      next = { action: `propões ao vendedor ${eur(target!)} com o relatório de avaliação`, why: `a ${eur(target!)} as contas fecham; a ${eur(atPrice.price)} faltam ~${eur(atPrice.gap)}`, owner: "Tu", due: ddmmLisbon(plusDays(now, 1)) };
    } else if (atAppraisalYoung && atAppraisalYoung.gap <= 0) {
      viability = "depends_on_young";
      next = {
        action: `hoje confirmas a idade ${who} (IMT Jovem) e propões ao vendedor ${eur(target!)} com o relatório de avaliação`,
        why: `com IMT Jovem a ${eur(target!)} fecha (sobram ~${eur(-atAppraisalYoung.gap)}); sem ele faltam ~${eur(atAppraisal!.gap)}; a ${eur(atPrice.price)} não fecha em nenhum caso`,
        owner: "Tu", due: ddmmLisbon(now),
      };
      next.stop = `se o comprador não tiver IMT Jovem nem mais ~${eur(atAppraisal!.gap)}, nem a ${eur(target!)} fecha — recomendo parar antes de pagar sinal (ou acionar a condição de financiamento, se o CPCV a tiver). Preço máximo que fecha hoje: ~${eur(maxPrice!)}.`;
    } else {
      viability = "unviable";
      next = {
        action: `hoje explicas ao comprador que, com ${eur(b.ownFunds!)}, o preço máximo que fecha é ~${eur(maxPrice!)}`,
        why: `a ${eur(atPrice.price)} faltam ~${eur(atPrice.gap)}${atAppraisal ? ` e mesmo a ${eur(atAppraisal.price)} faltam ~${eur(atAppraisal.gap)}` : ""}`,
        owner: "Tu", due: ddmmLisbon(now),
        stop: `recomendo parar este negócio se não aparecerem mais capitais ou outro titular até ${ddmmLisbon(plusDays(now, 2))} — antes de pagar sinal, ou acionando a condição de financiamento do CPCV.`,
      };
    }
  }

  const messages: PreparedMessage[] = [];
  if (target != null && viability !== "viable") {
    messages.push({
      to: "o vendedor", note: "sem dados financeiros do comprador",
      text: `Olá, o banco avaliou o imóvel em ${eur(target)} e só financia sobre esse valor. Para o negócio avançar, o meu cliente propõe ${eur(target)}. Consegue dar-me resposta até ${ddmmLisbon(plusDays(now, 2))}?${b.allegedOffer != null ? " Se houver outra proposta firme, peço que ma confirme por escrito, para sabermos com o que contamos." : ""}`,
    });
  }
  if (atPrice && atPrice.gap > 0) {
    const ask = young == null ? " Para fechar as contas: tem até 35 anos (IMT Jovem) ou mais capitais disponíveis?" : " Tem mais capitais disponíveis ou outro titular para o crédito?";
    messages.push({
      to: `o comprador${b.buyerName ? ` (${b.buyerName})` : ""}`,
      text: `Olá${b.buyerName ? ` ${b.buyerName}` : ""}, o banco avaliou em ${eur(b.appraisal ?? atPrice.price)}${target ? `, abaixo dos ${eur(atPrice.price)} da proposta` : ""}. Com o crédito a ${Math.round(ltv * 100)}%, a ${eur(atPrice.price)} precisaria de ~${eur(atPrice.totalNeeded)} entre entrada e encargos, e tem ${eur(atPrice.ownFunds)}.${target ? ` Vou propor ${eur(target)} ao vendedor.` : ""}${ask} São contas, não a decisão do banco.`,
    });
  }

  const label = b.proposalPrice != null ? `Negócio ${k(b.proposalPrice)}` : "Negócio";
  const tasks: PreparedTask[] = [];
  if (canSimulate) {
    if (young == null && viability === "depends_on_young") tasks.push({ title: `${label}: confirmar idade (IMT Jovem) e capitais extra do comprador`, dueYmd: today, owner: "Tu", priority: "alta" });
    if (target != null && viability !== "viable") tasks.push({ title: `${label}: propor ${k(target)} ao vendedor com a avaliação`, dueYmd: today, owner: "Tu", priority: "alta" });
    if (b.financingClause == null) tasks.push({ title: `${label}: confirmar no CPCV a condição de financiamento e o sinal`, dueYmd: today, owner: "Tu", priority: "alta" });
    tasks.push({ title: `${label}: decisão — avançar ou parar`, dueYmd: ymdLisbon(plusDays(now, 2)), owner: "Tu", priority: "alta" });
  }

  if (canSimulate) {
    if (young == null && atAppraisalYoung) questions.push("O comprador tem até 35 anos?");
    if (b.financingClause == null) questions.push("O CPCV já está assinado e tem condição de financiamento?");
    if (viability !== "viable") questions.push("Há mais capitais ou outro titular para o crédito?");
  }
  return { canSimulate, atPrice, atAppraisal, atAppraisalYoung, maxPrice, maxPriceYoung, risks, next, messages, tasks, questions: questions.slice(0, 3), viability };
}
