// "O que sabemos" — resumo factual do imóvel, montado apenas com dados já
// registados. Nunca infere nem assume: campo vazio simplesmente não aparece.
import { formatEUR } from "@/lib/demo-data";

export interface SummaryInput {
  property: Record<string, any>;
  owner?: { name?: string | null } | null;
  deal?: { stage?: string | null; title?: string | null } | null;
  currentOffer?: number | null;
  visitsDone?: number;
  interestsOpen?: number;
}

const STAGE_PT: Record<string, string> = {
  preparacao: "em preparação",
  angariacao: "em angariação",
  promocao: "em promoção",
  visitas: "na fase de visitas",
  proposta: "com proposta em cima da mesa",
  cpcv: "em CPCV",
  escritura: "à espera de escritura",
  concluido: "concluído",
};

/** Devolve 1 a 4 frases curtas em PT-PT. Nunca devolve frases inventadas. */
export function propertySummary(input: SummaryInput): string[] {
  const p = input.property ?? {};
  const frases: string[] = [];

  const local = [p.address, p.city || p.location].filter(Boolean).join(", ");
  const tipo = [p.typology, p.property_type].filter(Boolean).join(" ").trim();
  if (local && tipo) frases.push(`${tipo} em ${local}.`);
  else if (local) frases.push(`Imóvel em ${local}.`);
  else if (tipo) frases.push(`${tipo} sem morada registada.`);

  const preco = p.asking_price != null ? Number(p.asking_price) : null;
  if (preco != null && preco > 0) frases.push(`Está anunciado por ${formatEUR(preco)}.`);

  const dono = input.owner?.name?.trim();
  if (dono) frases.push(`O proprietário registado é ${dono}.`);

  const oferta = input.currentOffer != null ? Number(input.currentOffer) : null;
  if (oferta != null && oferta > 0) {
    const dif = preco != null && preco > 0 ? Math.round(((oferta - preco) / preco) * 100) : null;
    frases.push(
      dif != null && dif !== 0
        ? `A proposta atual é de ${formatEUR(oferta)} (${dif > 0 ? "+" : ""}${dif}% face ao anunciado).`
        : `A proposta atual é de ${formatEUR(oferta)}.`,
    );
  }

  if (input.deal?.stage) {
    frases.push(`O negócio ligado está ${STAGE_PT[String(input.deal.stage)] ?? String(input.deal.stage)}.`);
  }

  const visitas = input.visitsDone ?? 0;
  const interessados = input.interestsOpen ?? 0;
  if (visitas > 0 || interessados > 0) {
    const partes: string[] = [];
    if (visitas > 0) partes.push(`${visitas} visita${visitas === 1 ? "" : "s"} já feita${visitas === 1 ? "" : "s"}`);
    if (interessados > 0) partes.push(`${interessados} interessado${interessados === 1 ? "" : "s"} em aberto`);
    frases.push(`Há ${partes.join(" e ")}.`);
  }

  if (p.sold_at) frases.push("Está marcado como vendido.");
  else if (p.reserved_at) frases.push("Está reservado.");

  if (!frases.length) return ["Ainda sabemos pouco sobre este imóvel — só o que registaste até agora."];
  return frases.slice(0, 5);
}
