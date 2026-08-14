// Comparação de nomes com limite de palavra.
//
// Caso real (14/08): pesquisa por "Manuel" devolvia "Manuela" e "Maria
// Manuela" como se fossem candidatos directos. São pessoas diferentes — e
// escolher a errada significa falar do compromisso de um cliente com outro.
// Regra: um nome só é correspondência quando casa numa palavra inteira;
// tudo o resto é sugestão, nunca resultado.

import { foldText } from "@/lib/search/normalize";

export type NameMatchQuality = "exact" | "word" | "approx" | "none";

/** Palavras do nome, sem acentos e em minúsculas. */
function words(name: string | null | undefined): string[] {
  return foldText(name).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * "exact" — nome igual ao pedido ("Manuel" → "Manuel").
 * "word"  — o pedido é uma das palavras do nome ("Manuel" → "Manuel Silva").
 * "approx"— só aparece dentro de outra palavra ("Manuel" → "Manuela").
 */
export function nameMatchQuality(name: string | null | undefined, query: string): NameMatchQuality {
  const q = foldText(query);
  const full = foldText(name);
  if (!q || !full) return "none";
  if (full === q) return "exact";
  const qWords = words(q);
  const nWords = words(full);
  if (qWords.length && qWords.every((w) => nWords.includes(w))) return "word";
  if (full.includes(q)) return "approx";
  if (qWords.length && qWords.some((w) => nWords.some((n) => n.startsWith(w) || w.startsWith(n)))) return "approx";
  return "none";
}

/** `true` quando podemos ligar sem perguntar (nome inteiro presente). */
export function isConfidentNameMatch(name: string | null | undefined, query: string): boolean {
  const q = nameMatchQuality(name, query);
  return q === "exact" || q === "word";
}

export interface NamedRow { name?: string | null; [k: string]: unknown }

/**
 * Separa o que é mesmo a pessoa procurada do que é apenas parecido.
 * Só o primeiro grupo pode ser apresentado como resposta.
 */
export function classifyPeopleMatches<T extends NamedRow>(
  query: string,
  rows: T[],
): { exact: T[]; suggestions: T[] } {
  const exact: T[] = [];
  const suggestions: T[] = [];
  for (const r of rows) {
    const q = nameMatchQuality(r.name, query);
    if (q === "exact" || q === "word") exact.push(r);
    else if (q === "approx") suggestions.push(r);
  }
  return { exact, suggestions };
}

function namesList(rows: NamedRow[], max = 3): string {
  const list = rows.slice(0, max).map((r) => String(r.name ?? "").trim()).filter(Boolean);
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} ou ${list[list.length - 1]}`;
}

/** Resposta quando não há ninguém com esse nome exacto. */
export function noExactMatchReply(query: string, suggestions: NamedRow[]): string {
  const base = `Não encontrei ninguém chamado exatamente "${query.trim()}".`;
  if (!suggestions.length) return `${base} Queres que crie este contacto?`;
  return `${base} Talvez te refiras a: ${namesList(suggestions)} — ou é um contacto novo?`;
}

/** Pergunta antes de agendar com um nome que não existe na base. */
export function askLinkPersonQuestion(name: string, suggestions: NamedRow[]): string {
  const who = name.trim();
  if (suggestions.length) {
    return `Ainda não tenho ninguém chamado exatamente "${who}". Crio um contacto novo "${who}" ou é ${namesList(suggestions)}?`;
  }
  return `Ainda não tenho nenhum contacto "${who}". Crio um contacto novo com esse nome ou é alguém que já tens com outro nome?`;
}

/** Aviso quando o compromisso existe mas ficou sem contacto ligado. */
export function unlinkedEventReply(name: string, eventTitle: string, when: string): string {
  return `O ${name.trim()} do compromisso "${eventTitle.trim()}"${when ? ` (${when})` : ""} ainda não tem contacto associado — por isso não tenho o número dele. Queres que crie o contacto "${name.trim()}" e o ligue a esse compromisso?`;
}

// Palavras que aparecem depois de "com"/"para" mas não são nomes de pessoas.
const NOT_A_NAME = new Set([
  "o", "a", "os", "as", "ele", "ela", "eles", "elas", "cliente", "clientes",
  "visita", "reuniao", "reunião", "casa", "imovel", "imóvel", "amanha", "amanhã",
  "hoje", "isso", "isto", "ela", "equipa", "banco", "notario", "notário",
  "proprietario", "proprietário", "comprador", "vendedor", "lead", "contacto",
]);

const NAME_RE = /[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ'-]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ'-]+)?/;

/**
 * Nome da pessoa mencionada num pedido de agendamento:
 * "visita com o Manuel", "reunião com a Diana Costa", "visita associada a um
 * lead Manuel". Devolve `null` quando não há nome claro — nunca inventa.
 */
export function personNameFromEventText(text: string | null | undefined): string | null {
  const t = String(text ?? "");
  if (!t.trim()) return null;
  const patterns = [
    /\b(?:com|para|à|ao|a)\s+(?:o|a|os|as)?\s*(?:sr\.?|sra\.?|dona|dr\.?|dra\.?)?\s*(NAME)/,
    /\b(?:lead|cliente|contacto|propriet[áa]ri[oa]|comprador[a]?)\s+(NAME)/,
  ].map((re) => new RegExp(re.source.replace("NAME", NAME_RE.source)));
  for (const re of patterns) {
    const m = t.match(re);
    const cand = m?.[1]?.trim();
    if (!cand) continue;
    const first = foldText(cand.split(/\s+/)[0]);
    if (NOT_A_NAME.has(first) || first.length < 3) continue;
    return cand;
  }
  return null;
}
