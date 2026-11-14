// Comprador: riscos, próxima melhor ação e tarefas (puro e determinístico —
// o mesmo brief e o mesmo dia dão sempre as mesmas tarefas, para que
// "cria as tarefas" grave exatamente o que foi mostrado).

import { deadlineRisk, type Risk } from "../commercial/risk-detector";
import { ddmmLisbon, plusDays, ymdLisbon, type NextAction } from "../commercial/next-best-action";
import type { PreparedTask } from "../commercial/assisted-execution";
import { eur } from "../commercial/financial-simulator";
import { isUrgent, type BuyerBrief } from "./buyer-brief";

export interface BuyerPlan { risks: Risk[]; next: NextAction; tasks: PreparedTask[] }

export function buyerPlan(b: BuyerBrief, now: Date, opts: { hasProposals: boolean; aboveCeilingOnly?: boolean }): BuyerPlan {
  const today = ymdLisbon(now);
  const who = b.buyerName?.value ?? "comprador";
  const risks: Risk[] = [];
  const dl = deadlineRisk("prazo de compra", b.deadline?.value ?? null, today);
  if (dl) risks.push(dl);
  else if (b.urgent?.value) risks.push({ kind: "deadline", severity: "alta", text: "urgente sem data — confirma a data limite", evidence: "confirmado" });

  const youngOpen = !!b.budgetMax?.note && /IMT Jovem/.test(b.budgetMax.note);
  const budgetGap = b.budgetMax?.status === "assumed" && b.financingApproved && b.budgetMax.value < b.financingApproved.value;
  if (budgetGap) {
    risks.push({
      kind: "budget_reality", severity: "alta", evidence: "calculado",
      text: `com crédito a 90%, o teto real é ~${eur(b.budgetMax!.value)}, abaixo da pré-aprovação de ${eur(b.financingApproved!.value)}`,
    });
  }
  if (b.financingApproved) {
    risks.push({ kind: "pre_approval", severity: "média", evidence: "confirmado", text: "pré-aprovação não é aprovação final — o banco decide depois de avaliar o imóvel" });
  }
  if (opts.aboveCeilingOnly) {
    risks.push({ kind: "budget_reality", severity: "média", evidence: "calculado", text: "o que encontrei está acima do teto assumido" });
  }

  const urgent = isUrgent(b, now);
  let next: NextAction;
  if (budgetGap && youngOpen) {
    next = {
      action: `confirmas a idade do ${who} e pedes ao banco a simulação com um imóvel concreto`,
      why: "decide se o teto é o de crédito a 90% ou o de IMT Jovem com garantia pública",
      owner: "Tu", due: ddmmLisbon(now),
    };
  } else if (opts.hasProposals) {
    next = urgent
      ? { action: "hoje confirmas a disponibilidade dos que encaixam e marcas as visitas", why: "com prazo curto, cada dia sem visita conta", owner: "Tu", due: ddmmLisbon(now) }
      : { action: "marcas visita ao primeiro da lista esta semana", why: "é o que melhor encaixa nos critérios confirmados", owner: "Tu", due: ddmmLisbon(plusDays(now, 3)) };
  } else {
    next = { action: "manda-me referências ZMPT ou links que tenhas, ou alarga a zona, e eu cruzo logo com estes critérios", why: "sem anúncios verificados não há o que propor", owner: "Tu", due: ddmmLisbon(plusDays(now, 1)) };
  }

  const tasks: PreparedTask[] = [];
  if (b.financingApproved) tasks.push({ title: `${who}: validar com o banco a pré-aprovação e o teto${youngOpen ? " (e a idade para IMT Jovem)" : ""}`, dueYmd: today, owner: "Tu", priority: "alta" });
  tasks.push({ title: `${who}: marcar visitas aos imóveis que encaixam`, dueYmd: ymdLisbon(plusDays(now, urgent ? 1 : 3)), owner: "Tu", priority: urgent ? "alta" : "media" });
  tasks.push({ title: `${who}: rever a pesquisa com o Afonso`, dueYmd: ymdLisbon(plusDays(now, urgent ? 2 : 5)), owner: "Tu", priority: "media" });
  return { risks, next, tasks };
}
