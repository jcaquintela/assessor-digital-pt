// Custo de uma mensagem WhatsApp iniciada por nós.
//
// A Meta cobra por mensagem de template enviada FORA da janela de 24h, com
// preço a variar por categoria (utility, marketing, authentication) e por país
// do destinatário. Dentro da janela, templates de utilidade não são cobrados.
//
// Não inventamos preços: o custo só é calculado quando existe uma tarifa
// registada na tabela `whatsapp_template_rates`. Sem tarifa, o custo fica a
// null e aparece como "por confirmar" — nunca como zero.

export type TemplateCategory = "utility" | "marketing" | "authentication" | "service" | "unknown";

export interface TemplateRate {
  category: string;
  country_code: string;
  price_eur: number;
  currency?: string | null;
  effective_from: string;
  source?: string | null;
}

export function normalizeCategory(raw: string | null | undefined): TemplateCategory {
  const c = String(raw ?? "").trim().toLowerCase();
  if (c === "utility" || c === "marketing" || c === "authentication" || c === "service") return c;
  return "unknown";
}

/** País do destinatário a partir do E.164 (sem "+" ou com ele). */
const PREFIXES: Array<[string, string]> = [
  ["351", "PT"], ["34", "ES"], ["55", "BR"], ["44", "GB"], ["33", "FR"],
  ["49", "DE"], ["39", "IT"], ["31", "NL"], ["41", "CH"], ["32", "BE"],
  ["353", "IE"], ["1", "US"],
];

export function countryFromPhone(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "??";
  const sorted = [...PREFIXES].sort((a, b) => b[0].length - a[0].length);
  for (const [prefix, cc] of sorted) if (digits.startsWith(prefix)) return cc;
  return "??";
}

/**
 * Uma mensagem só é faturável quando é template E vai fora da janela de 24h.
 * (Templates de utilidade dentro da janela não são cobrados.)
 */
export function isBillable(input: {
  isTemplate: boolean;
  outsideWindow: boolean | null;
  category?: string | null;
}): boolean {
  if (!input.isTemplate) return false;
  if (!input.outsideWindow) return false;
  return true;
}

/** Tarifa em vigor mais recente para categoria+país à data indicada. */
export function pickRate(
  rates: TemplateRate[],
  args: { category: TemplateCategory; country: string; at?: Date },
): TemplateRate | null {
  const at = (args.at ?? new Date()).toISOString().slice(0, 10);
  const candidates = rates.filter(
    (r) =>
      normalizeCategory(r.category) === args.category &&
      r.effective_from <= at &&
      (r.country_code === args.country || r.country_code === "*"),
  );
  if (!candidates.length) return null;
  // País exacto ganha ao genérico; depois a data mais recente.
  candidates.sort((a, b) => {
    const exact = Number(b.country_code === args.country) - Number(a.country_code === args.country);
    return exact !== 0 ? exact : b.effective_from.localeCompare(a.effective_from);
  });
  return candidates[0] ?? null;
}

export interface CostEstimate {
  billable: boolean;
  costEur: number | null;
  source: string;
}

export function estimateTemplateCost(input: {
  isTemplate: boolean;
  outsideWindow: boolean | null;
  category?: string | null;
  toPhone: string;
  rates: TemplateRate[];
  at?: Date;
}): CostEstimate {
  const category = normalizeCategory(input.category);
  const billable = isBillable(input);
  if (!billable) {
    return {
      billable: false,
      costEur: 0,
      source: input.isTemplate ? "dentro_da_janela" : "texto_livre",
    };
  }
  const country = countryFromPhone(input.toPhone);
  const rate = pickRate(input.rates, { category, country, at: input.at });
  if (!rate) {
    return { billable: true, costEur: null, source: `sem_tarifa:${category}/${country}` };
  }
  return {
    billable: true,
    costEur: Number(rate.price_eur),
    source: `tarifa:${category}/${rate.country_code}@${rate.effective_from}`,
  };
}
