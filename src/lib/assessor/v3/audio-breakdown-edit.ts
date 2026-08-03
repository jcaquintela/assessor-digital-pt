// Correções item-a-item de uma proposta de áudio, antes do "sim".
//
// O consultor ouve a lista numerada e pode dizer "o 2 é amanhã às 10h",
// "apaga o 3" ou "no 1 o texto é ...". Só depois confirma tudo de uma vez.
// Parte pura: sem BD, sem rede.

import type { AudioBreakdown, BreakdownItem } from "./audio-breakdown";

export interface BreakdownEdit {
  /** Índice 0-based do item a corrigir. */
  index: number;
  remove?: boolean;
  text?: string;
  due_date?: string;
  due_time?: string;
}

const ORDINALS: Record<string, number> = {
  primeiro: 1, primeira: 1, segundo: 2, segunda: 2, terceiro: 3, terceira: 3,
  quarto: 4, quarta: 4, quinto: 5, quinta: 5, sexto: 6, sexta: 6,
  setimo: 7, sétimo: 7, setima: 7, sétima: 7, oitavo: 8, oitava: 8,
};

function strip(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function readIndex(msg: string, count: number): number | null {
  const plain = strip(msg);
  // "o 2", "no 2", "item 2", "ponto 2", "2." no início
  const num = plain.match(/(?:^|\b)(?:o|no|na|do|da|item|ponto|numero|nº|n\.º)?\s*(\d{1,2})(?=\b|[.,:)])/);
  if (num) {
    const n = Number(num[1]);
    if (n >= 1 && n <= count) return n - 1;
  }
  for (const [word, n] of Object.entries(ORDINALS)) {
    if (plain.includes(strip(word)) && n <= count) return n - 1;
  }
  return null;
}

function readDate(msg: string, today: string): string | null {
  const plain = strip(msg);
  if (/\bdepois de amanha\b/.test(plain)) return addDays(today, 2);
  if (/\bamanha\b/.test(plain)) return addDays(today, 1);
  if (/\bhoje\b/.test(plain)) return today;
  const iso = plain.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = plain.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (br) {
    const d = br[1].padStart(2, "0");
    const m = br[2].padStart(2, "0");
    let y = br[3] ?? today.slice(0, 4);
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m}-${d}`;
  }
  return null;
}

function readTime(msg: string): string | null {
  const plain = strip(msg);
  const m = plain.match(/\b(\d{1,2})\s*(?:h|:)\s*(\d{2})?\b/);
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23) return null;
  const mm = m[2] ? Number(m[2]) : 0;
  if (mm > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

const EDIT_HINT =
  /(?:^|\b)(muda|mudar|altera|alterar|corrige|corrigir|troca|trocar|ajusta|ajustar|passa|passar|fica|é|e|para|apaga|apagar|remove|remover|tira|tirar|esquece|risca)\b/i;

const REMOVE_HINT = /\b(apaga|apagar|remove|remover|tira|tirar|esquece|esquecer|risca|riscar|elimina|eliminar)\b/i;

const TEXT_HINT = /\b(texto|diz|dizer|escreve|escrever|criterio|critério)\b/i;

const KIND_WORDS: Array<{ re: RegExp; kind: BreakdownItem["kind"] }> = [
  { re: /\b(facto|factos|informacao|informação)\b/i, kind: "fact" },
  { re: /\b(seguimento|seguimentos|tarefa|lembrete|agendamento|visita)\b/i, kind: "follow_up" },
  { re: /\b(nota|notas|comentario|comentário)\b/i, kind: "note" },
];

/** "apaga a nota", "tira o seguimento", "esquece o último" — sem número. */
function readIndexWithoutNumber(msg: string, items: BreakdownItem[]): number | null {
  const plain = strip(msg);
  if (/\b(ultimo|ultima)\b/.test(plain)) return items.length - 1;
  if (/\b(primeiro|primeira)\b/.test(plain)) return 0;
  for (const { re, kind } of KIND_WORDS) {
    if (!re.test(plain)) continue;
    const matches = items
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => it.kind === kind);
    if (matches.length === 1) return matches[0].i;
    if (matches.length > 1 && kind === "note" && /\bconfidencial\b/.test(plain)) {
      const conf = matches.filter(({ it }) => it.confidential);
      if (conf.length === 1) return conf[0].i;
    }
    return null;
  }
  return null;
}

/**
 * Lê uma correção a um item específico. Devolve null quando a mensagem não é
 * claramente uma correção (para o motor seguir o caminho normal).
 */
export function parseBreakdownEdit(
  message: string,
  count: number,
  today: string,
  items?: BreakdownItem[],
): BreakdownEdit | null {
  const msg = String(message ?? "").trim();
  if (!msg || count <= 0) return null;
  if (!EDIT_HINT.test(strip(msg))) return null;
  let index = readIndex(msg, count);
  if (index === null && REMOVE_HINT.test(strip(msg)) && items?.length) {
    index = readIndexWithoutNumber(msg, items.slice(0, count));
  }
  if (index === null || index < 0 || index >= count) return null;

  if (REMOVE_HINT.test(strip(msg))) return { index, remove: true };

  const due_date = readDate(msg, today);
  const due_time = readTime(msg);
  if (due_date || due_time) {
    return { index, ...(due_date ? { due_date } : {}), ...(due_time ? { due_time } : {}) };
  }

  // Correção de texto: "no 1 o texto é ...", "o 2 é: ...", "muda o 3 para ..."
  const m = msg.match(/(?::|(?:^|\s)(?:para|é|e|fica|diz)\s)\s*(.{3,400})$/i);
  if (m) {
    const text = m[1].replace(/^["'“”]|["'“”]$/g, "").trim();
    if (text && (TEXT_HINT.test(strip(msg)) || text.split(/\s+/).length >= 2)) {
      return { index, text };
    }
  }
  return null;
}

/** Aplica a correção e devolve a nova proposta (imutável). */
export function applyBreakdownEdit(
  breakdown: AudioBreakdown,
  edit: BreakdownEdit,
): AudioBreakdown {
  const items = breakdown.items.slice();
  const current = items[edit.index];
  if (!current) return breakdown;
  if (edit.remove) {
    items.splice(edit.index, 1);
  } else {
    const next: BreakdownItem = { ...current };
    if (edit.text) next.text = edit.text.slice(0, 400);
    if (edit.due_date || edit.due_time) {
      // Uma data/hora só faz sentido num seguimento — passa a sê-lo.
      next.kind = "follow_up";
      if (edit.due_date) next.due_date = edit.due_date;
      if (edit.due_time) next.due_time = edit.due_time;
    }
    items[edit.index] = next;
  }
  return { ...breakdown, items };
}

export function describeBreakdownEdit(edit: BreakdownEdit, removed?: BreakdownItem): string {
  const n = edit.index + 1;
  if (edit.remove) {
    const what =
      removed?.kind === "follow_up" ? "o seguimento"
      : removed?.kind === "fact" ? "o facto"
      : removed?.kind === "note" ? (removed.confidential ? "a nota confidencial" : "a nota")
      : `o ponto ${n}`;
    return `Tirei ${what} do ponto ${n}. O resto fica na mesma:`;
  }
  if (edit.due_date || edit.due_time) return `Corrigi a data do ponto ${n}.`;
  return `Corrigi o texto do ponto ${n}.`;
}
