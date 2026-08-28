// Processador de Áudio Imobiliário — parte pura (sem BD, sem rede).
//
// Um áudio informal e comprido raramente contém uma coisa só. Contém factos
// sobre o imóvel, coisas para fazer, e comentários que o consultor nunca diria
// em voz alta a um cliente. Isto separa o áudio nesses itens e escreve a
// proposta única que o consultor confirma de uma vez.

export type BreakdownKind = "fact" | "follow_up" | "note";

export interface BreakdownItem {
  kind: BreakdownKind;
  /** Texto do item já em PT-PT natural. */
  text: string;
  /** Nome da pessoa referida, se houver. */
  person_name?: string | null;
  /** Referência livre ao imóvel ("apartamento da Rua X"). */
  property_hint?: string | null;
  /** Só para follow_up. */
  due_date?: string | null;
  due_time?: string | null;
  /** Só para note. */
  confidential?: boolean;
}

/**
 * Contacto candidato a um item. Espelha `PersonCandidate` de
 * `people/resolve-person.server` sem importar servidor para o lado puro.
 */
export interface BreakdownPersonCandidate {
  id: string;
  name: string;
  phone?: string | null;
  relationship_type?: string | null;
}

/**
 * Ligação de contacto de cada item (paralelo a `items`).
 * `person_id` só fica preenchido quando a resolução é inequívoca; caso
 * contrário guardamos os candidatos e perguntamos na confirmação do áudio.
 */
export interface BreakdownPersonLink {
  person_id: string | null;
  candidates: BreakdownPersonCandidate[];
}

export interface AudioBreakdown {
  items: BreakdownItem[];
  /** Assunto geral do áudio, para dar contexto à proposta. */
  subject?: string | null;
  /** Uma entrada por item, na mesma ordem. */
  links?: BreakdownPersonLink[];
}

const MAX_ITEMS = 8;

export function emptyPersonLink(): BreakdownPersonLink {
  return { person_id: null, candidates: [] };
}

function coerceLink(raw: any): BreakdownPersonLink {
  const list = Array.isArray(raw?.candidates) ? raw.candidates : [];
  return {
    person_id: raw?.person_id ? String(raw.person_id) : null,
    candidates: list
      .filter((c: any) => c?.id && c?.name)
      .slice(0, 4)
      .map((c: any) => ({
        id: String(c.id),
        name: String(c.name),
        phone: c?.phone ? String(c.phone) : null,
        relationship_type: c?.relationship_type ? String(c.relationship_type) : null,
      })),
  };
}

export function coerceBreakdown(raw: any): AudioBreakdown {
  const list = Array.isArray(raw?.items) ? raw.items : [];
  const items: BreakdownItem[] = [];
  for (const it of list.slice(0, MAX_ITEMS)) {
    const kind = String(it?.kind ?? "").toLowerCase();
    const text = String(it?.text ?? "").trim();
    if (!text) continue;
    if (kind !== "fact" && kind !== "follow_up" && kind !== "note") continue;
    items.push({
      kind: kind as BreakdownKind,
      text: text.slice(0, 400),
      person_name: it?.person_name ? String(it.person_name).slice(0, 120) : null,
      property_hint: it?.property_hint ? String(it.property_hint).slice(0, 160) : null,
      due_date: /^\d{4}-\d{2}-\d{2}$/.test(String(it?.due_date ?? "")) ? String(it.due_date) : null,
      due_time: /^\d{2}:\d{2}$/.test(String(it?.due_time ?? "")) ? String(it.due_time) : null,
      confidential: kind === "note" ? it?.confidential === true : false,
    });
  }
  return {
    items,
    subject: raw?.subject ? String(raw.subject).slice(0, 160) : null,
  };
}

function labelFor(item: BreakdownItem): string {
  if (item.kind === "fact") return "Facto";
  if (item.kind === "follow_up") return "Seguimento";
  return item.confidential ? "Nota confidencial" : "Nota";
}

function dueSuffix(item: BreakdownItem): string {
  if (item.kind !== "follow_up" || !item.due_date) return "";
  const [y, m, d] = item.due_date.split("-");
  const date = `${d}/${m}/${y}`;
  return item.due_time ? ` (${date} às ${item.due_time})` : ` (${date})`;
}

/** Proposta única: tudo o que saiu do áudio, numa só confirmação. */
export function formatBreakdownProposal(breakdown: AudioBreakdown): string {
  const lines = breakdown.items.map((it, i) => `${i + 1}. ${labelFor(it)}: ${it.text}${dueSuffix(it)}`);
  const head = breakdown.subject
    ? `Ouvi o áudio sobre ${breakdown.subject}. Separei em ${breakdown.items.length} coisas:`
    : `Ouvi o áudio. Separei em ${breakdown.items.length} coisas:`;
  const confidential = breakdown.items.some((i) => i.kind === "note" && i.confidential);
  const tail = confidential
    ? "A nota confidencial fica só para ti — nunca sai em nada que eu prepare para outra pessoa.\n\nSe algum ponto estiver errado, diz-me qual (ex.: 'o 2 é amanhã às 10h'). Guardo tudo assim?"
    : "Se algum ponto estiver errado, diz-me qual (ex.: 'o 2 é amanhã às 10h'). Guardo tudo assim?";
  return `${head}\n\n${lines.join("\n")}\n\n${tail}`;
}

export function formatBreakdownDone(created: { facts: number; followUps: number; notes: number }): string {
  const parts: string[] = [];
  if (created.facts) parts.push(`${created.facts} ${created.facts === 1 ? "facto" : "factos"}`);
  if (created.followUps) parts.push(`${created.followUps} ${created.followUps === 1 ? "seguimento" : "seguimentos"}`);
  if (created.notes) parts.push(`${created.notes} ${created.notes === 1 ? "nota" : "notas"}`);
  if (!parts.length) return "Não consegui guardar nada deste áudio. Queres tentar outra vez?";
  return `Feito — guardei ${parts.join(", ")}.`;
}

/** Proposta reescrita depois de uma correção a um item. */
export function formatBreakdownRevised(breakdown: AudioBreakdown, note: string): string {
  const lines = breakdown.items.map((it, i) => `${i + 1}. ${labelFor(it)}: ${it.text}${dueSuffix(it)}`);
  return `${note}\n\n${lines.join("\n")}\n\nAssim está certo? Guardo tudo?`;
}

/** Heurística barata: vale a pena separar este áudio em vários itens? */
export function worthBreakingDown(transcript: string): boolean {
  const t = String(transcript ?? "").trim();
  if (t.length < 180) return false;
  const sentences = t.split(/[.!?…]+\s/).filter((s) => s.trim().length > 12);
  return sentences.length >= 3;
}