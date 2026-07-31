// Resumo rápido de pessoa — leitura pura, para ler em 10 segundos antes de
// uma reunião. Detecta o pedido e formata o resultado. Sem I/O: o caller
// (person-brief.server.ts) trata da base de dados.
//
// É uma LEITURA: nunca pede confirmação, nunca depende do nível de
// autonomia, e nunca devolve "não percebi" — se não houver nada registado
// sobre a pessoa, diz isso com todas as letras.

import { boldWa, italicWa } from "../culture/whatsapp-format";

const TRAILERS = [
  /\bantes\s+d[ao]s?\s+(reuni[ãa]o|encontro|visita|call|chamada)\b.*$/i,
  /\bpara\s+a\s+reuni[ãa]o\b.*$/i,
  /\bpor\s+favor\b.*$/i,
];

const LEAD_ARTICLES = /^(?:o|a|os|as|do|da|dos|das|de|d[oa]\s+sr[ao]?\.?|sr[ao]?\.?)\s+/i;

// "o que tenho sobre a Marta", "o que sei da Marta", "resume-me a Marta",
// "resumo da Marta", "fala-me do João", "põe-me a par da Marta".
const PATTERNS: RegExp[] = [
  /(?:^|\s)(?:o\s+)?que\s+(?:tenho|temos|sei|sabemos|h[áa])\s+(?:sobre|acerca\s+de|d[aeo]s?)\s+(.+)$/i,
  /(?:^|\s)resume?-?\s?(?:me)?\s+(?:a|o|as|os)?\s*(.+)$/i,
  /(?:^|\s)resumo\s+(?:d[aeo]s?|sobre)\s+(.+)$/i,
  /(?:^|\s)fala-?me\s+(?:sobre|d[aeo]s?)\s+(.+)$/i,
  /(?:^|\s)p[õo]e-?me\s+a\s+par\s+(?:d[aeo]s?|sobre)\s+(.+)$/i,
  /(?:^|\s)hist[óo]rico\s+d[aeo]s?\s+(.+)$/i,
];

// Palavras que indicam que o pedido não é sobre uma pessoa.
const NOT_A_PERSON = /\b(agenda|dia|semana|m[êe]s|hoje|amanh[ãa]|placas?|im[óo]ve(l|is)|neg[óo]cios?|comiss[õo]es|despesas?|lembretes?|seguimentos?|prioridades?|conversa)\b/i;

export function detectPersonBriefQuery(text: string): string | null {
  const t = String(text ?? "").trim();
  if (!t || t.length > 160) return null;

  for (const re of PATTERNS) {
    const m = re.exec(t);
    if (!m?.[1]) continue;
    let name = m[1];
    for (const tr of TRAILERS) name = name.replace(tr, "");
    name = name
      .replace(/[?!.,;:]+\s*$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(LEAD_ARTICLES, "")
      .trim();
    if (!name || name.length < 2 || name.length > 60) continue;
    if (NOT_A_PERSON.test(name)) continue;
    // Precisa de parecer um nome: começa por letra.
    if (!/^\p{L}/u.test(name)) continue;
    return name;
  }
  return null;
}

export interface PersonBrief {
  name: string;
  relationship?: string | null;
  phone?: string | null;
  lastInteraction?: { when: string | null; text: string } | null;
  properties: Array<{ title: string; status?: string | null; price?: number | null }>;
  deals: Array<{ label: string; value?: number | null; status?: string | null }>;
  nextAction?: { text: string; when?: string | null } | null;
}

export function phonePt(raw: unknown): string {
  const digits = String(raw ?? "").replace(/\D/g, "").replace(/^351/, "");
  if (digits.length !== 9) return String(raw ?? "");
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

export function formatDatePt(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", year: "numeric",
  }).format(d);
}

function money(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "";
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

const REL_LABEL: Record<string, string> = {
  proprietario: "proprietário",
  comprador: "comprador",
  potencial_cliente: "potencial cliente",
  parceiro: "parceiro",
  referencia: "referência",
  outro: "contacto",
};

const PROP_STATUS: Record<string, string> = {
  por_angariar: "por angariar",
  em_angariacao: "em angariação",
  angariado: "angariado",
  ativo: "ativo",
  reservado: "reservado",
  vendido: "vendido",
  arquivado: "arquivado",
};

export function personNotFoundReply(name: string): string {
  return `Não encontrei ninguém com o nome ${boldWa(name)} nos teus contactos.`;
}

export function ambiguousPersonReply(names: string[]): string {
  return `Tenho mais do que uma pessoa com esse nome:\n${names
    .slice(0, 5)
    .map((n) => `- ${boldWa(n)}`)
    .join("\n")}\nDe qual queres o resumo?`;
}

export function formatPersonBrief(b: PersonBrief): string {
  const head = [boldWa(b.name), b.relationship ? italicWa(REL_LABEL[b.relationship] ?? b.relationship) : null]
    .filter(Boolean)
    .join(" · ");

  const lines: string[] = [];

  if (b.lastInteraction) {
    const when = formatDatePt(b.lastInteraction.when);
    const txt = b.lastInteraction.text.trim().slice(0, 220);
    lines.push(`- Última nota${when ? ` (${when})` : ""}: ${txt}`);
  }

  for (const p of b.properties.slice(0, 3)) {
    const bits = [boldWa(p.title)];
    if (p.status) bits.push(PROP_STATUS[p.status] ?? p.status);
    if (money(p.price)) bits.push(money(p.price));
    lines.push(`- Imóvel: ${bits.filter(Boolean).join(" · ")}`);
  }

  for (const d of b.deals.slice(0, 3)) {
    const bits = [d.label];
    if (money(d.value)) bits.push(boldWa(money(d.value)));
    if (d.status) bits.push(italicWa(d.status));
    lines.push(`- Negócio: ${bits.filter(Boolean).join(" · ")}`);
  }

  if (b.nextAction) {
    const when = formatDatePt(b.nextAction.when);
    lines.push(`- Próxima ação${when ? ` (${when})` : ""}: ${b.nextAction.text.trim()}`);
  }

  if (b.phone) lines.push(`- Contacto: ${boldWa(phonePt(b.phone))}`);

  if (!lines.length) {
    return `${head}\nAinda não tenho nada registado sobre esta pessoa — sem notas, imóveis ou negócios ligados.`;
  }

  return `${head}\n${lines.join("\n")}`;
}
