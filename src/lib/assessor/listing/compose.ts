// Resposta única para uma angariação com pouca procura: diagnóstico, kit
// orgânico pronto, plano de 7 dias, estados de ação e próximo passo.

import { formatActionStates, type ActionItem } from "../commercial/action-states";
import { parseListingPrice } from "../qualification/proposal-format";
import { checkPrice, compareCompetitor, eur, readFunnel, type FunnelBreak, type VerifiedSighting } from "./diagnosis";
import type { ListingBrief } from "./listing-brief";
import {
  CHANNEL_CHECKLIST, colleagueMessage, differentiation, kpis, paidRule, photoBrief, sevenDayPlan, socialCopy,
} from "./organic-kit";

export const LISTING_MARKER = "*Angariação ";
export const isListingReply = (t: string | null | undefined) => String(t ?? "").startsWith(LISTING_MARKER);

export type ComparablesStatus = "ok" | "rate_limited" | "failed" | "not_run";
export interface Comparable { url: string; title: string; description?: string | null; host: string }

const ddmm = (d: Date) => new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit" }).format(d);

export interface ListingComposeInput {
  brief: ListingBrief;
  now: Date;
  /** Procura na carteira própria correu? found=null quando não correu. */
  ownLookup: { ran: boolean; found: boolean; price: number | null; url: string | null };
  comparables: { status: ComparablesStatus; results: Comparable[] };
  /** Turno de continuação: só a atualização, sem repetir o kit. */
  update?: boolean;
}

function title(b: ListingBrief, update: boolean): string {
  const id = b.ref ?? [b.propertyType, b.typology, b.zone].filter(Boolean).join(" ");
  return `${LISTING_MARKER}${id}${update ? " — atualização" : " — diagnóstico"}*`;
}

function factsLine(b: ListingBrief): string {
  const parts = [
    [b.propertyType, b.typology, b.zone ? `em ${b.zone}` : null].filter(Boolean).join(" ") || null,
    b.askingPrice != null ? `${eur(b.askingPrice)} (informado por ti)` : "preço por confirmar",
    b.exclusive ? "exclusivo" : null,
    b.weeksOnMarket != null ? `${b.weeksOnMarket} semanas no mercado` : null,
    b.visits != null ? `${b.visits} visitas` : null,
  ].filter(Boolean);
  const line = parts.join(" · ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

function nextStep(breakAt: FunnelBreak, b: ListingBrief, now: Date, discrepancy: boolean): string {
  const checkpoint = ddmm(new Date(now.getTime() + 3 * 86400_000));
  const first = discrepancy
    ? "hoje confirmas o preço publicado em cada portal"
    : ({
        reach: "hoje aumentas a exposição: mensagem aos colegas e redes",
        listing_click: "hoje trocas a 1.ª foto e o título",
        listing_convert: "hoje revês fotos e descrição e mandas-me 2-3 links de comparáveis para cruzar o preço",
        follow_up: "hoje ligas aos contactos que já tens e qualificas cada um",
        none: "manténs o plano e mandas-me os números no checkpoint",
        unknown: "hoje tiras do portal impressões, cliques e pedidos de contacto e mandas-mos",
      } as Record<FunnelBreak, string>)[breakAt];
  return `*Próximo passo:* ${first}. Se quiseres que te lembre do checkpoint, diz "lembra-me dia ${checkpoint} de rever ${b.ref ?? "a angariação"}" e fica marcado.`;
}

export function composeListingReply(i: ListingComposeInput): string {
  const { brief: b, now } = i;
  const seen = ddmm(now);
  const parts: string[] = [title(b, !!i.update), factsLine(b)];
  const funnel = readFunnel(b);
  parts.push(funnel.lines.join("\n"));

  const sightings: VerifiedSighting[] = [];
  if (i.comparables.status === "ok" && b.ref) {
    for (const r of i.comparables.results) {
      if (`${r.title} ${r.description ?? ""} ${r.url}`.toUpperCase().replace(/[-\s]/g, "").includes(b.ref)) {
        sightings.push({ url: r.url, host: r.host, price: parseListingPrice(`${r.title} ${r.description ?? ""}`), seenAt: seen });
      }
    }
  }
  const price = checkPrice(b, { ownRecordPrice: i.ownLookup.found ? i.ownLookup.price : null, sightings });
  if (price.line) parts.push(price.line);
  const comp = compareCompetitor(b);
  if (comp) parts.push(comp);

  if (i.comparables.status === "ok") {
    const list = i.comparables.results.filter((r) => /^https?:\/\//.test(r.url)).slice(0, 3);
    parts.push(list.length
      ? `À volta, nos portais (visto a ${seen}; referência rápida, não avaliação):\n${list.map((r, n) => {
          const p = parseListingPrice(`${r.title} ${r.description ?? ""}`);
          const priceTxt = /\d\s*€/.test(r.title) ? "" : ` — ${p != null ? eur(p) : "preço por confirmar"}`;
          return `${n + 1}. ${r.title}${priceTxt} · ${r.host}\n   ${r.url}`;
        }).join("\n")}`
      : "Nos portais não encontrei anúncios comparáveis agora. Prefiro dizer-te isso do que inventar.");
  } else if (i.comparables.status === "rate_limited") {
    parts.push("Já fiz as pesquisas de mercado de hoje; amanhã vejo os comparáveis nos portais.");
  } else if (i.comparables.status === "failed") {
    parts.push("A pesquisa de comparáveis nos portais falhou agora. Não te mostro anúncios que não consegui confirmar.");
  }

  if (!i.update) {
    parts.push([
      "*Kit orgânico (pronto a usar)*",
      `- Mensagem aos colegas: ${colleagueMessage(b)}`,
      `- Redes: ${socialCopy(b)}`,
      `- Foto principal: ${photoBrief(b)}.`,
      `- Diferenciação: ${differentiation(b)}.`,
      `- Canais: ${CHANNEL_CHECKLIST.join("; ")}.`,
      `- KPI: ${kpis()}.`,
    ].join("\n"));
    const plan = sevenDayPlan(b, now);
    parts.push([
      "*Plano 7 dias*",
      `- ${seen} · Afonso: diagnóstico, kit e plano (feito acima)`,
      ...plan.map((s) => `- ${s.day} · ${s.owner}: ${s.task}`),
      paidRule(b),
    ].join("\n"));
  }

  const items: ActionItem[] = [];
  if (i.ownLookup.ran) {
    items.push({
      state: "executed", evidenceTool: "own_listing_lookup",
      text: `procurei ${b.ref ?? "o imóvel"} na tua carteira (${i.ownLookup.found ? "encontrado" : "não está lá"})`,
    });
  }
  if (i.comparables.status === "ok") {
    items.push({ state: "executed", evidenceTool: "search_similar_listings", text: `pesquisa de comparáveis nos portais (${i.comparables.results.length} ${i.comparables.results.length === 1 ? "anúncio" : "anúncios"})` });
  }
  items.push({ state: "prepared", text: i.update ? "leitura do funil com os teus números" : "diagnóstico, kit orgânico e plano de 7 dias" });
  items.push({ state: "awaiting_approval", text: "enviar mensagens, publicar, mudar preço ou anúncio, gastar margem paga — nada disto faço sem o teu sim" });
  const noAccess = ["estatísticas do anúncio nos portais", "carteira da Rede/Zome", "acompanhar o anúncio sozinho (não monitorizo portais)"];
  if (b.competitorRef && b.competitorPrice == null) noAccess.splice(1, 0, `anúncio do concorrente ${b.competitorRef}`);
  items.push({ state: "no_access", text: noAccess.join(", ") });
  parts.push(formatActionStates(items));

  parts.push(nextStep(funnel.breakAt, b, now, price.discrepancy));

  const questions: string[] = [];
  if (b.askingPrice == null) questions.push("Qual o preço pedido?");
  if (!b.features.length && !i.update) questions.push("Quais os 3 pontos fortes do imóvel?");
  if (questions.length) parts.push(`Para afinar, de uma vez:\n${questions.map((q) => `- ${q}`).join("\n")}`);
  return parts.join("\n\n");
}
