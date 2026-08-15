// Resultado de leitura → resposta com dados reais.
//
// Uma ferramenta de consulta que corre sem erro mas não devolve a lista ao
// consultor é, na prática, uma falha: ele pediu para ver, não para o
// Assessor prometer que ia ver. Este módulo transforma o outcome das
// ferramentas de leitura em texto natural com os dados.

import type { ToolExecResult } from "./act.server";
import { boldWa, italicWa } from "../culture/whatsapp-format";
import { noExactMatchReply, unlinkedEventReply } from "@/lib/people/name-match";

// Ferramentas que só lêem. Nunca escrevem na BD.
export const QUERY_TOOLS = new Set([
  "search_people",
  "search_properties",
  "search_prospecting_leads",
  "search_active_reminders",
  "search_agenda",
  "search_files",
  "search_emails",
  "summarize_email",
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
      boldWa(head),
      s(row.phone) ? boldWa(phonePt(row.phone)) : null,
      s(row.location) && s(row.location) !== head ? s(row.location) : null,
      italicWa(LEAD_STATUS_LABEL[s(row.status)] ?? s(row.status)),
    ]);
  }
  if (tool === "search_people") {
    return joinParts([
      boldWa(s(row.name) || "Contacto"),
      s(row.phone) ? boldWa(phonePt(row.phone)) : null,
      italicWa(s(row.relationship_type)),
    ]);
  }
  if (tool === "search_properties") {
    return joinParts([
      boldWa(s(row.title) || "Imóvel"),
      s(row.typology),
      s(row.location) || s(row.city),
      money(row.asking_price) ? boldWa(money(row.asking_price)) : null,
    ]);
  }
  if (tool === "search_active_reminders") {
    const when = s(row.scheduled_for);
    const human = when
      ? new Intl.DateTimeFormat("pt-PT", {
          timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
        }).format(new Date(when))
      : "";
    return joinParts([human ? boldWa(human) : null, s(row.message_preview) || "lembrete"], " — ");
  }
  if (tool === "search_agenda") {
    const t = s(row.due_time).slice(0, 5);
    return joinParts([t ? boldWa(t.replace(":", "h")) : null, boldWa(s(row.title) || "compromisso")], " — ");
  }
  if (tool === "search_files") {
    return joinParts([
      boldWa(s(row.original_file_name) || "Ficheiro"),
      italicWa(s(row.document_type) || s(row.classification)),
    ]);
  }
  if (tool === "search_emails") {
    const when = s(row.sent_at)
      ? new Intl.DateTimeFormat("pt-PT", {
          timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
        }).format(new Date(s(row.sent_at)))
      : "";
    const who = s(row.from).replace(/<[^>]*>/g, "").replace(/"/g, "").trim() || s(row.from);
    return joinParts([
      boldWa(who || "Remetente"),
      s(row.subject) || "(sem assunto)",
      when,
      row.is_read === false ? italicWa("por ler") : null,
    ]);
  }
  return joinParts([boldWa(s(row.title) || s(row.name))]);
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
  search_files: {
    one: "Tens 1 ficheiro no Drive Inteligente:",
    many: (n) => `Tens ${n} ficheiros no Drive Inteligente:`,
    empty: "Não tens ficheiros no Drive Inteligente.",
  },
  search_emails: {
    one: "Tens 1 email:",
    many: (n) => `Tens ${n} emails:`,
    empty: "Não encontrei emails com esses critérios.",
  },
};

function rowsOf(data: unknown): Array<Record<string, unknown>> {
  const d = data as Record<string, unknown> | null | undefined;
  const raw = (d?.results ?? d?.items ?? []) as unknown;
  return Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
}

/** "amanhã às 09:00" em linguagem simples para a resposta. */
function humanWhen(dueDate: unknown, dueTime: unknown): string {
  const iso = s(dueDate);
  if (!iso) return "";
  const day = new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit",
  }).format(new Date(iso));
  const t = s(dueTime).slice(0, 5);
  return t ? `${day} às ${t}` : day;
}

// Constrói a resposta com os dados de todas as leituras bem sucedidas.
// Devolve null quando não houve nenhuma leitura com sucesso — nesse caso o
// motor mantém a resposta que já tinha.
// Email só pode ser negado quando a conta não está mesmo ligada.
export const EMAIL_NOT_CONNECTED_REPLY =
  "Ainda não tens a tua conta de email ligada a mim. Liga-a em Definições > Email e depois digo-te logo o que chegou.";
export const EMAIL_NEEDS_RECONNECT_REPLY =
  "A autorização da tua conta de email expirou. Volta a ligá-la em Definições > Email e vou buscar os emails novos.";
import { MAIL_PROVIDER_CHOICE_REPLY } from "@/lib/providers/active";
export { MAIL_PROVIDER_CHOICE_REPLY };

export function formatQueryResults(toolResults: ToolExecResult[]): string | null {
  const reads = toolResults.filter((t) => t.ok && isQueryTool(t.name));
  if (!reads.length) return null;

  const blocks: string[] = [];
  for (const r of reads) {
    const rows = rowsOf(r.data);
    // "Manuel" não pode devolver "Manuela" como se fosse a mesma pessoa.
    const d = r.data as any;
    if (r.name === "search_emails" || r.name === "summarize_email") {
      if (d?.not_connected) { blocks.push(EMAIL_NOT_CONNECTED_REPLY); continue; }
      if (d?.needs_reconnect) { blocks.push(EMAIL_NEEDS_RECONNECT_REPLY); continue; }
      if (d?.needs_provider_choice) { blocks.push(MAIL_PROVIDER_CHOICE_REPLY); continue; }
      if (r.name === "summarize_email") {
        if (d?.not_found) {
          blocks.push("Não encontrei esse email na tua caixa de entrada.");
        } else {
          const subj = s(d?.subject);
          blocks.push(
            [subj ? boldWa(subj) : null, s(d?.summary) || "Não consegui resumir esse email."]
              .filter(Boolean).join("\n"),
          );
        }
        continue;
      }
      // Inbox triada: pessoas conhecidas primeiro; newsletters só contadas.
      const known = rows.filter((row) => row.bucket === "known_person");
      const personal = rows.filter((row) => row.bucket !== "known_person" && row.bucket !== "noise");
      const hidden = Number(d?.hidden_noise) || 0;
      if (!rows.length) {
        blocks.push(
          hidden > 0
            ? `Não tens emails de pessoas — só ${hidden} ${hidden === 1 ? "newsletter/notificação" : "newsletters e notificações"}. Queres ver na mesma?`
            : (HEADER["search_emails"] as any).empty,
        );
        continue;
      }
      const shownEmails = [...known, ...personal, ...rows.filter((row) => row.bucket === "noise")].slice(0, MAX_ITEMS);
      const namesKnown = known.map((row) => s(row.person_name) || s(row.from)).filter(Boolean);
      const relevantCount = known.length + personal.length;
      const headParts: string[] = [];
      if (relevantCount > 0) {
        headParts.push(
          relevantCount === 1
            ? `Tens 1 email de ${namesKnown[0] ? "pessoa conhecida" : "alguém"}${namesKnown.length ? ` (${namesKnown.join(", ")})` : ""}:`
            : `Tens ${relevantCount} emails${namesKnown.length ? ` de pessoas conhecidas (${namesKnown.join(", ")})` : ""}:`,
        );
      }
      const emailLines = shownEmails.map((row) => `- ${lineFor("search_emails", row)}`.trim());
      const tail =
        hidden > 0
          ? `\n\nHá ainda ${hidden} ${hidden === 1 ? "email de newsletter/notificação" : "emails de newsletters e notificações"}. Queres ver os todos?`
          : "";
      blocks.push(`${headParts.join(" ")}\n${emailLines.join("\n")}${tail}`.trim());
      continue;
    }
    if (r.name === "search_people" && d?.no_exact_match) {
      const q = String(d.query ?? "").trim();
      const ev = d.unlinked_event;
      if (ev?.title) {
        blocks.push(unlinkedEventReply(q, String(ev.title), humanWhen(ev.due_date, ev.due_time)));
      } else {
        const near = (d.suggestions?.length ? d.suggestions : rows) as Array<{ name?: string | null }>;
        blocks.push(noExactMatchReply(q, near));
      }
      continue;
    }
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
    const lines = shown.map((row) => `- ${lineFor(r.name, row)}`.trim());
    const total = Number((r.data as any)?.total);
    const count = Number.isFinite(total) && total > rows.length ? total : rows.length;
    const header = count === 1 ? head.one : head.many(count);
    // Quando a lista é grande, mostramos os mais recentes mas nunca trocamos
    // silenciosamente o pedido de "todos" por uma pergunta fechada: a opção de
    // ver tudo tem de estar sempre na resposta.
    const more =
      count > shown.length
        ? `\n${italicWa(`mostro os ${shown.length} mais recentes`)}\nQueres a lista toda ou só de uma pessoa/imóvel?`
        : "";
    blocks.push(`${header}\n${lines.join("\n")}${more}`);
  }
  return blocks.join("\n\n").trim() || null;
}
