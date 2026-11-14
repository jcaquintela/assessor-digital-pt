// Negócio em risco — extração determinística dos factos.
//
// Tudo o que vem do consultor é "confirmado por ti"; o que o consultor relata
// de terceiros sem prova (ex.: "o vendedor diz que tem outro interessado a
// 390k") fica ALEGADO e nunca muda as contas.

import { foldText } from "@/lib/search/normalize";

export interface DealBrief {
  buyerName: string | null;
  proposalPrice: number | null;
  appraisal: number | null;
  /** 0.9 = 90% */
  ltv: number | null;
  ownFunds: number | null;
  loanCap: number | null;
  allegedOffer: number | null;
  /** Quem alega ("vendedor", "proprietário", "colega"). */
  allegedBy: string | null;
  cpcvDate: string | null;
  deedDate: string | null;
  cpcvSigned: boolean | null;
  financingClause: boolean | null;
  deposit: number | null;
  withdrawalSignal: boolean;
  age: number | null;
  use: "hpp" | "secondary" | null;
}

function parseMoney(tok: string, unit: string | undefined): number | null {
  const raw = Number(tok.replace(/[.\s]/g, "").replace(",", "."));
  if (!Number.isFinite(raw)) return null;
  const u = (unit ?? "").toLowerCase();
  const v = u === "k" || u === "mil" ? raw * 1000 : raw;
  return v >= 1000 ? v : null;
}

const MONEY_RE = /(\d{1,3}(?:[.\s]\d{3})+|\d+(?:,\d+)?)\s*(k\b|mil\b|€|euros?\b)/gi;

/** Primeiro valor monetário depois da palavra-chave (até 45 caracteres). */
function moneyAfter(fold: string, key: RegExp, span = 45): number | null {
  const m = key.exec(fold);
  if (!m) return null;
  const win = fold.slice(m.index + m[0].length, m.index + m[0].length + span);
  MONEY_RE.lastIndex = 0;
  const hit = MONEY_RE.exec(win);
  return hit ? parseMoney(hit[1]!, hit[2]) : null;
}

const MONTHS: Record<string, number> = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };

function dateAfter(fold: string, key: RegExp, now: Date): string | null {
  const m = key.exec(fold);
  if (!m) return null;
  const win = fold.slice(m.index, m.index + m[0].length + 30);
  const d1 = win.match(/(\d{1,2})\s*[/.-]\s*(\d{1,2})/);
  const d2 = win.match(/(\d{1,2}) de (janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/);
  const [d, mo] = d1 ? [Number(d1[1]), Number(d1[2])] : d2 ? [Number(d2[1]), MONTHS[d2[2]!]!] : [0, 0];
  if (!d || !mo || mo > 12 || d > 31) return null;
  let y = now.getUTCFullYear();
  if (Date.UTC(y, mo - 1, d) < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 60 * 86400_000) y += 1;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const SIGNAL_RE = /\b(avaliac(?:ao|oes)|avaliou|avaliad[oa]|cpcv|escritura|desist\w*|negocio em risco|proposta aceite)\b/;
const DEAL_RE = /\b(proposta|negocio|oferta|vendedor|proprietario|comprador|cpcv|escritura)\b/;

/** Mensagem sobre um negócio em curso que pode estar em risco. */
export function isDealRisk(text: string): boolean {
  const t = foldText(text);
  if (!SIGNAL_RE.test(t) || !DEAL_RE.test(t)) return false;
  const b = extractDealBrief(text);
  return !!(b.proposalPrice || b.appraisal || b.cpcvDate || b.deedDate || b.withdrawalSignal);
}

export function extractDealBrief(text: string, now: Date = new Date()): DealBrief {
  const raw = String(text ?? "");
  const t = foldText(raw);
  const allegedM = t.match(/\b(vendedor|proprietari[oa]|dono|colega|outra agencia)\b[^.]{0,30}\b(?:diz|disse|afirma|alega|garante)\b[^.]{0,40}?(?:outr[oa]s?\s+(?:interessad[oa]s?|propostas?|ofertas?|comprador(?:es)?))/);
  const allegedGeneric = /\b(alegad[oa]|outr[oa] interessad[oa]|outra proposta|outra oferta)\b/.test(t);
  const allegedOffer = allegedM || allegedGeneric
    ? moneyAfter(t, /(?:outr[oa]s?\s+(?:interessad[oa]s?|propostas?|ofertas?|comprador(?:es)?)|alegad[oa])/, 40)
    : null;
  const ltvM = t.match(/\b(\d{2,3})\s*%[^.]{0,40}\b(?:financ|credito|banco|emprest)|\b(?:financ\w*|credito|banco)\b[^.]{0,40}?(\d{2,3})\s*%/);
  const ltvPct = ltvM ? Number(ltvM[1] ?? ltvM[2]) : null;
  const ageM = t.match(/\b(?:tem|com)\s+(\d{2})\s+anos\b/);
  const name = raw.match(/\b(?:comprador(?:a)?|cliente)[,:]?\s+(?:(?:o|a)\s+)?([A-ZÀ-Ý][a-zà-ÿ]+)/);
  const clauseNo = /\bsem (?:condicao|clausula) (?:de|resolutiva de) financiamento\b/.test(t);
  const clauseYes = !clauseNo && /\b(?:condicao|clausula)(?: resolutiva)? de financiamento|sujeito a (?:financiamento|aprovacao do credito)\b/.test(t);
  return {
    buyerName: name ? name[1]! : null,
    proposalPrice: moneyAfter(t, /\b(?:proposta|oferta aceite|preco acordado|acordado|fez proposta|proposta aceite)\b(?: de| a| em| por)?/),
    appraisal: moneyAfter(t, /\b(?:avaliac(?:ao|oes)|avaliou|avaliad[oa])\b(?: do banco| bancaria)?(?: deu| foi| de| em| a| por| ficou(?: em| a)?)?/),
    ltv: ltvPct && ltvPct >= 50 && ltvPct <= 100 ? ltvPct / 100 : null,
    ownFunds: moneyAfter(t, /\b(?:capitais(?: proprios)?|capital proprio|entrada|poupancas?|dinheiro proprio)\b(?: de)?/) ??
      (() => { const m = t.match(/(\d{1,3}(?:[.\s]\d{3})+|\d+)\s*(k|mil|€)\s*(?:de\s+)?(?:capitais|capital proprio|entrada)/); return m ? parseMoney(m[1]!, m[2]) : null; })(),
    loanCap: moneyAfter(t, /\bpre-?aprova\w*\b(?: de| ate| em)?/),
    allegedOffer,
    allegedBy: allegedM ? allegedM[1]! : allegedOffer ? "terceiro" : null,
    cpcvDate: dateAfter(t, /\bcpcv\b/, now),
    deedDate: dateAfter(t, /\bescritura\b/, now),
    cpcvSigned: /\bcpcv (?:ja )?(?:assinado|feito|celebrado)|assinamos o cpcv|assinou o cpcv\b/.test(t) ? true : /\b(?:sem|antes do|falta(?: fazer)? o|ainda nao (?:ha|temos|assinamos)) cpcv\b/.test(t) ? false : null,
    financingClause: clauseNo ? false : clauseYes ? true : null,
    deposit: moneyAfter(t, /\bsinal\b(?: de)?/),
    withdrawalSignal: /\b(desist\w*|quer sair|pensa(?:r)? em sair|recuar|a fugir|esfriou)\b/.test(t),
    age: ageM ? Number(ageM[1]) : null,
    use: /\b(investimento|arrendar|segunda habitacao|para rendimento)\b/.test(t) ? "secondary" : /\b(habitacao propria|para viver|casa de familia)\b/.test(t) ? "hpp" : null,
  };
}

/** Junta factos de várias mensagens; o mais recente ganha. */
export function mergeDealBriefs(list: DealBrief[]): DealBrief {
  const out = extractDealBrief("");
  for (const b of list) {
    for (const k of Object.keys(b) as Array<keyof DealBrief>) {
      const v = b[k];
      if (k === "withdrawalSignal") { if (v) out.withdrawalSignal = true; continue; }
      if (v != null) (out as any)[k] = v;
    }
  }
  return out;
}
