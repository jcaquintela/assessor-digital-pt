// Angariação: riscos, próxima melhor ação e tarefas (puro e determinístico).

import { type Risk } from "../commercial/risk-detector";
import { ddmmLisbon, plusDays, ymdLisbon, type NextAction } from "../commercial/next-best-action";
import type { PreparedTask } from "../commercial/assisted-execution";
import type { FunnelBreak } from "./diagnosis";
import type { ListingBrief } from "./listing-brief";
import { sevenDayPlan } from "./organic-kit";

export interface ListingPlan { risks: Risk[]; next: NextAction; tasks: PreparedTask[] }

const FIRST: Record<FunnelBreak, { action: string; why: string }> = {
  reach: { action: "hoje aumentas a exposição: mensagem aos colegas e redes", why: "o anúncio quase não está a ser visto" },
  listing_click: { action: "hoje trocas a 1.ª foto e o título", why: "é visto mas não é aberto" },
  listing_convert: { action: "hoje revês fotos e descrição e mandas-me 2-3 links de comparáveis para cruzar o preço", why: "é aberto mas não gera contactos" },
  follow_up: { action: "hoje ligas aos contactos que já tens e qualificas cada um", why: "há procura que não chega a visita" },
  none: { action: "manténs o plano e mandas-me os números no checkpoint", why: "o funil não mostra uma quebra clara" },
  unknown: { action: "hoje tiras do portal impressões, cliques e pedidos de contacto e mandas-mos", why: "sem esses números não sei onde o funil parte" },
};

export function listingPlan(b: ListingBrief, now: Date, o: { breakAt: FunnelBreak; discrepancy: boolean; demandProblem: boolean }): ListingPlan {
  const risks: Risk[] = [];
  if (o.demandProblem) risks.push({ kind: "low_demand", severity: "alta", evidence: "confirmado", text: `baixa procura: 0 visitas${b.weeksOnMarket ? ` em ${b.weeksOnMarket} semanas` : ""}` });
  if (o.discrepancy) risks.push({ kind: "price_discrepancy", severity: "média", evidence: "alegado", text: "preço diferente entre portais, por verificar" });
  if (b.exclusive && b.weeksOnMarket && b.weeksOnMarket >= 6 && o.demandProblem) {
    risks.push({ kind: "withdrawal", severity: "média", evidence: "calculado", text: "proprietário pode perder confiança na exclusividade se não houver visitas em breve" });
  }
  const f = o.discrepancy ? { action: "hoje confirmas o preço publicado em cada portal", why: "um preço diferente entre portais afasta compradores" } : FIRST[o.breakAt];
  const next: NextAction = { ...f, owner: "Tu", due: ddmmLisbon(now) };
  const ref = b.ref ?? "angariação";
  const tasks: PreparedTask[] = sevenDayPlan(b, now).map((s, k) => ({
    title: `${ref}: ${s.task}`,
    dueYmd: ymdLisbon(plusDays(now, [0, 1, 2, 3, 6][k] ?? k)),
    owner: s.owner,
    priority: k === 0 ? "alta" : "media",
  }));
  return { risks, next, tasks };
}
