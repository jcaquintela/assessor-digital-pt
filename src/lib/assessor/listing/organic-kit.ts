// Kit orgânico pronto a usar + plano de 7 dias (puro). Nada aqui é enviado:
// é material PREPARADO para o consultor copiar, adaptar e aprovar.

import { eur } from "./diagnosis";
import type { ListingBrief } from "./listing-brief";

const ddmm = (d: Date) => new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit" }).format(d);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400_000);

function label(b: ListingBrief): string {
  const kind = b.propertyType ? b.propertyType[0]!.toUpperCase() + b.propertyType.slice(1) : "Imóvel";
  return [kind, b.typology, b.zone ? `em ${b.zone}` : null].filter(Boolean).join(" ");
}

export function colleagueMessage(b: ListingBrief): string {
  const price = b.askingPrice != null ? eur(b.askingPrice) : "[preço]";
  const strong = b.features.length ? b.features.slice(0, 3).join(", ") : "[3 pontos fortes]";
  const l = label(b);
  return `"Colegas, tenho em ${b.exclusive ? "exclusivo" : "venda"} ${b.propertyType ? `${["moradia", "quinta", "loja"].includes(b.propertyType) ? "uma" : "um"} ${l.charAt(0).toLowerCase()}${l.slice(1)}` : l}${b.ref ? ` (${b.ref})` : ""}, ${price}. Destaques: ${strong}. Partilho nas condições habituais da agência. Têm compradores para este perfil? Envio fotos e marco visita esta semana."`;
}

export function socialCopy(b: ListingBrief): string {
  const strong = b.features.length ? b.features.slice(0, 2).join(" e ") : "[o que a torna única]";
  return `"${label(b)} — ${strong}. ${b.askingPrice != null ? eur(b.askingPrice) : "[preço]"}. Visitas esta semana, fala comigo por mensagem."`;
}

export function photoBrief(b: ListingBrief): string {
  const house = b.propertyType === "moradia";
  return house
    ? "fachada inteira ou o exterior mais forte, luz de fim de tarde, horizontal, sem carros nem caixotes; a 1.ª foto é o que decide o clique"
    : "a divisão mais luminosa, de dia, horizontal, arrumada; a 1.ª foto é o que decide o clique";
}

export function differentiation(b: ListingBrief): string {
  return b.features.length
    ? `lidera com ${b.features.slice(0, 3).join(", ")} — no título e na 1.ª linha da descrição`
    : "diz-me os 3 pontos que o concorrente não tem; sem isso o anúncio compete só pelo preço";
}

export const CHANNEL_CHECKLIST = [
  "preço igual em todos os portais",
  "1.ª foto trocada",
  "título com o ponto forte",
  "grupos de consultores da agência",
  "redes pessoais",
  "compradores da tua carteira com este perfil",
];

export function kpis(): string {
  return "impressões, cliques, pedidos de contacto e visitas marcadas — anotados no dia 1 e no dia 7";
}

export interface PlanStep { day: string; owner: "Tu" | "Afonso"; task: string }

export function sevenDayPlan(b: ListingBrief, now: Date): PlanStep[] {
  const d = (n: number) => ddmm(addDays(now, n));
  const steps: PlanStep[] = [
    { day: d(0), owner: "Tu", task: b.elsewherePrice != null ? "confirmar o preço publicado em cada portal e alinhar" : "tirar os números do portal (impressões, cliques, contactos)" },
    { day: d(1), owner: "Tu", task: "trocar a 1.ª foto e o título; enviar a mensagem aos colegas" },
    { day: d(2), owner: "Tu", task: "publicar o copy nas redes; ligar aos 2-3 compradores da tua carteira com este perfil" },
    { day: d(3), owner: "Tu", task: "checkpoint: mandas-me os números e eu leio o funil" },
    { day: d(6), owner: "Tu", task: "checkpoint final: meta proposta ≥3 contactos qualificados e ≥1 visita marcada" },
  ];
  return steps;
}

export function paidRule(b: ListingBrief): string {
  const base = "Pago só com evidência no dia 7: se as impressões continuarem baixas, a margem paga compra alcance; se houver impressões mas não cliques/contactos, pago não resolve — mexe-se no anúncio ou no preço primeiro.";
  return b.paidMargin ? base : `${base} (Não me disseste se há margem paga.)`;
}
