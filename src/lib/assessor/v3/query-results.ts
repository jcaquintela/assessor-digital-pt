// Resultado de leitura → resposta com dados reais.
//
// Uma ferramenta de consulta que corre sem erro mas não devolve a lista ao
// consultor é, na prática, uma falha: ele pediu para ver, não para o
// Assessor prometer que ia ver. Este módulo transforma o outcome das
// ferramentas de leitura em texto natural com os dados.

import type { ToolExecResult } from "./act.server";

// Ferramentas que só lêem. Nunca escrevem na BD.
export const QUERY_TOOLS = new Set([
  "search_people",
  "search_properties",
  "search_prospecting_leads",
  "search_active_reminders",
  "search_agenda",
]);

export function isQueryTool(name: string): boolean {
  return QUERY_TOOLS.has(name);
}

const MAX_ITEMS = 10;

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v);
}

function money(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "";
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function phonePt(raw: unknown): string {
  const digits = s(raw).replace(/\D/g, "").replace(/^351/, "");
  if (digits.length !== 9) return s(raw);
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

const LEAD_STATUS_LABEL: Record<string, string> = {
  to_contact: "por contactar",
  contact_attempted: "tentativa de contacto",
  contacted: "contactada",
  no_interest: "sem interesse",
  opportunity: "oportunidade",
  converted: "convertida",
  archived: "arquivada",
};

function joinParts(parts: Array<string | null | undefined>, sep = " · "): string {
  return parts.map((p) => s(p)).filter(Boolean).join(sep);
}

function lineFor(tool: string, row: Record<string, unknown>): string {
  if (tool === "search_prospecting_leads") {
    const head = s(row.title) || s(row.address) || s(row.location) || "Placa";
    return joinParts([
      head,
      phonePt(row.phone),
      s(row.location) && s(row.location) !== head ? s(row.location) : null,
      LEAD_STATUS_LABEL[s(row.status)] ?? s(row.status),
    ]);
  }
  if (tool === "search_people") {
    return joinParts([s(row.name) || "Contacto", phonePt(row.phone), s(row.relationship_type)]);
  }
  if (tool === "search_properties") {
    return joinParts([
      s(row.title) || "Imóvel",
      s(row.typology),
      s(row.location) || s(row.city),
      money(row.asking_price),
    ]);
  }
  if (tool === "search_active_reminders") {
    const when = s(row.scheduled_for);
    const human = when
      ? new Intl.DateTimeFormat("pt-PT", {
          timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
        }).format(new Date(when))
      : "";
    return joinParts([human, s(row.message_preview) || "lembrete"], " — ");
  }
  if (tool === "search_agenda") {
    const t = s(row.due_time).slice(0, 5);
    return joinParts([t ? t.replace(":", "h") : null, s(row.title) || "compromisso"], " — ");
  }
  return joinParts([s(row.title) || s(row.name)]);
}

const HEADER: Record<string, { one: string; many: (n: number) => string; empty: string }> = {
  search_prospecting_leads: {
    one: "Tens 1 placa registada:",
    many: (n) => `Tens ${n} placas registadas:`,
    empty: "Não encontrei placas registadas com esses critérios.",
  },
  search_people: {
    one: "Encontrei 1 contacto:",
    many: (n) => `Encontrei ${n} contactos:`,
    empty: "Não encontrei ninguém com esse nome.",
  },
  search_properties: {
    one: "Encontrei 1 imóvel:",
    many: (n) => `Encontrei ${n} imóveis:`,
    empty: "Não encontrei imóveis com esses critérios.",
  },
  search_active_reminders: {
    one: "Tens 1 lembrete activo:",
    many: (n) => `Tens ${n} lembretes activos:`,
    empty: "Não tens lembretes activos.",
  },
  search_agenda: {
    one: "Tens 1 compromisso:",
    many: (n) => `Tens ${n} compromissos:`,
    empty: "Não tens compromissos nesse período.",
  },
};

function rowsOf(data: unknown): Array<Record<string, unknown>> {
  const d = data as Record<string, unknown> | null | undefined;
  const raw = (d?.results ?? d?.items ?? []) as unknown;
  return Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
}

// Constrói a resposta com os dados de todas as leituras bem sucedidas.
// Devolve null quando não houve nenhuma leitura com sucesso — nesse caso o
// motor mantém a resposta que já tinha.
export function formatQueryResults(toolResults: ToolExecResult[]): string | null {
  const reads = toolResults.filter((t) => t.ok && isQueryTool(t.name));
  if (!reads.length) return null;

  const blocks: string[] = [];
  for (const r of reads) {
    const rows = rowsOf(r.data);
    const head = HEADER[r.name] ?? {
      one: "Encontrei 1 registo:",
      many: (n: number) => `Encontrei ${n} registos:`,
      empty: "Não encontrei nada com esses critérios.",
    };
    if (!rows.length) {
      blocks.push(head.empty);
      continue;
    }
    const shown = rows.slice(0, MAX_ITEMS);
    const lines = shown.map((row) => `• ${lineFor(r.name, row)}`.trim());
    const header = rows.length === 1 ? head.one : head.many(rows.length);
    const more = rows.length > shown.length ? `\n(mostro os primeiros ${shown.length})` : "";
    blocks.push(`${header}\n${lines.join("\n")}${more}`);
  }
  return blocks.join("\n\n").trim() || null;
}
