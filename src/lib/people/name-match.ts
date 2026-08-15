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

// ---------------------------------------------------------------------------
// Desambiguação com contexto.
//
// Caso real (15/08): com dois contactos "Carla Martins" na lista, a pergunta
// saía "…ou é Carla Martins ou Carla Martins?" — sem nada que os distinga.
// Regra: quando dois candidatos têm o mesmo nome, a pergunta mostra sempre
// algo que os separe (papel, telefone) e, em último caso, a ordem de registo.
// ---------------------------------------------------------------------------

export interface CandidateLike extends NamedRow {
  phone?: string | null;
  relationship_type?: string | null;
}

const RELATIONSHIP_PT: Record<string, string> = {
  proprietario: "proprietário",
  potencial_cliente: "potencial cliente",
  comprador: "comprador",
  investidor: "investidor",
  colega: "colega",
  parceiro: "parceiro",
  outro: "outro",
};

function candidateDetails(c: CandidateLike): string[] {
  const rel = String(c.relationship_type ?? "").trim();
  const phone = String(c.phone ?? "").trim();
  return [rel ? (RELATIONSHIP_PT[rel] ?? rel.replace(/_/g, " ")) : "", phone].filter(Boolean);
}

/** Nome + contexto distintivo ("Carla Martins (proprietária, 912 …)"). */
export function personLabel(c: CandidateLike): string {
  const name = String(c.name ?? "").trim();
  const details = candidateDetails(c);
  return details.length ? `${name} (${details.join(", ")})` : name;
}

/** Etiquetas garantidamente diferentes entre si (nunca duas iguais). */
export function describeCandidates(rows: CandidateLike[], max = 4): string[] {
  const labels = rows.slice(0, max).map(personLabel).filter(Boolean);
  const counts = new Map<string, number>();
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  const seen = new Map<string, number>();
  return labels.map((l) => {
    if ((counts.get(l) ?? 0) < 2) return l;
    const n = (seen.get(l) ?? 0) + 1;
    seen.set(l, n);
    return `${l} (o ${n}.º que registaste)`;
  });
}

/** "A, B ou C" a partir de etiquetas já distintas. */
export function joinOr(parts: string[]): string {
  const list = parts.filter(Boolean);
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
    const labels = describeCandidates(suggestions as CandidateLike[]);
    const sameName = suggestions.some((s) => foldText(s.name) === foldText(who));
    if (sameName) {
      return `Tenho mais do que um contacto "${who}": ${labels.join("; ")}. Qual deles é? Se não for nenhum, crio um contacto novo.`;
    }
    return `Ainda não tenho ninguém chamado exatamente "${who}". Crio um contacto novo "${who}" ou é ${joinOr(labels)}?`;
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

// Tratamentos: "Sra Carla Martins", "Dr. João", "Eng. Costa". Nunca são nome
// próprio — caso real (15/08): o Afonso perguntou se criava o contacto "Sra".
const HONORIFIC_SRC =
  "(?:[Ss]r|[Ss]ra|[Ss]r\\.?ª|[Dd]r|[Dd]ra|[Ee]ng|[Ee]ng[ºª]|[Ee]nga|[Pp]rof|[Aa]rq|[Dd]ona|[Dd]\\.)\\.?";
const HONORIFIC_ONLY_RE = new RegExp(`^${HONORIFIC_SRC}$`);

/** Remove tratamentos do início do nome ("Sra Carla Martins" → "Carla Martins"). */
export function stripHonorific(name: string | null | undefined): string {
  let out = String(name ?? "").trim();
  for (let i = 0; i < 3; i++) {
    const next = out.replace(new RegExp(`^${HONORIFIC_SRC}\\s+`), "").trim();
    if (next === out) break;
    out = next;
  }
  return out;
}

/** `true` quando o texto é apenas um tratamento ("Sra", "Dr."). */
export function isHonorificOnly(name: string | null | undefined): boolean {
  return HONORIFIC_ONLY_RE.test(String(name ?? "").trim());
}

/**
 * Nome da pessoa mencionada num pedido de agendamento:
 * "visita com o Manuel", "reunião com a Diana Costa", "visita associada a um
 * lead Manuel". Devolve `null` quando não há nome claro — nunca inventa.
 */
export function personNameFromEventText(text: string | null | undefined): string | null {
  const t = String(text ?? "");
  if (!t.trim()) return null;
  const patterns = [
    // Tratamento seguido de nome, mesmo sem preposição antes:
    // "…possível angariação. Sra Carla Martins".
    new RegExp(`(?:^|[\\s,;:(.])${HONORIFIC_SRC}\\s+(NAME)`.replace("NAME", NAME_RE.source)),
    // `(?:^|[\s,;:(])` em vez de `\b`: "à" não é caractere de palavra em JS,
    // por isso "Ligar à Manuela" nunca chegava a ter nome extraído.
    new RegExp(`(?:^|[\\s,;:(])(?:com|para|à|ao|a)\\s+(?:o|a|os|as)?\\s*(?:${HONORIFIC_SRC}\\s+)?(NAME)`.replace("NAME", NAME_RE.source)),
    /\b(?:lead|cliente|contacto|propriet[áa]ri[oa]|comprador[a]?)\s+(NAME)/,
  ].map((re) => new RegExp(re.source.replace("NAME", NAME_RE.source)));
  for (const re of patterns) {
    const m = t.match(re);
    const cand = stripHonorific(m?.[1]);
    if (!cand) continue;
    if (isHonorificOnly(cand)) continue;
    const first = foldText(cand.split(/\s+/)[0]);
    if (NOT_A_NAME.has(first) || first.length < 3) continue;
    return cand;
  }
  return null;
}
