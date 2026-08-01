import { sanitizeMiscFields } from "../misc-text";
import { cleanTitle } from "../titles";
// Rede de segurança "nada se perde" — motor v3.
//
// Regra de produto: uma mensagem profissional do consultor NUNCA pode
// desaparecer. Se o Assessor não a percebeu, ou tentou executar algo e
// falhou, o texto original fica em Diversos > Por tratar, consultável no
// dashboard. Este módulo é o único ponto de decisão e de escrita.

import type { DomainContext } from "../v2/domain.server";
import { isConfirmation, isRejection, isGreeting, isThanks } from "../culture/short-answers";

export type TurnOutcome =
  | "executed_ok"       // ferramenta correu bem — nada a guardar
  | "duplicate"         // já existia — nada a guardar
  | "query"             // consulta (agenda, pessoa) — nada a guardar
  | "tool_failed"       // tentou executar e falhou — guardar
  | "not_understood"    // não percebeu — guardar
  | "service_down";     // a IA está indisponível — guardar (não é incompreensão)

// Mensagens descartáveis: confirmações, rejeições, saudações, agradecimentos
// e texto demasiado curto para ter conteúdo profissional.
export function isDisposableMessage(content: string): boolean {
  const text = String(content ?? "").trim();
  if (text.length < 3) return true;
  if (isConfirmation(text) || isRejection(text)) return true;
  if (isGreeting(text) || isThanks(text)) return true;
  // Frases muito curtas sem qualquer sinal de conteúdo (números, nomes, verbos).
  if (text.length < 8 && !/\d/.test(text)) return true;
  return false;
}

export function shouldArchiveTurn(params: {
  content: string;
  outcome: TurnOutcome;
}): boolean {
  const archivable = params.outcome === "tool_failed"
    || params.outcome === "not_understood"
    || params.outcome === "service_down";
  if (!archivable) return false;
  return !isDisposableMessage(params.content);
}

// O conteúdo arquivado pode ser um bloco de contexto com várias linhas,
// incluindo a pergunta do próprio Assessor ("Assessor: Feito. Registei...").
// O título tem de ser o assunto do consultor, nunca a voz do Assessor.
export function deriveArchiveTitle(content: string): string {
  const lines = String(content ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^\s*(assessor|afonso|assistente|bot)\s*[:\-–—]/i.test(l))
    .map((l) => l.replace(/^\(depois:\s*/i, "").replace(/\)$/, "").trim())
    .filter(Boolean);
  for (const line of lines) {
    const t = cleanTitle(line);
    if (t) return t.length > 120 ? `${t.slice(0, 117)}...` : t;
  }
  const fallback = cleanTitle(String(content ?? "").replace(/\n+/g, " "));
  if (fallback) return fallback.length > 120 ? `${fallback.slice(0, 117)}...` : fallback;
  return "Nota por tratar";
}

export async function archiveToMiscellaneous(
  ctx: DomainContext,
  content: string,
  reason: string,
): Promise<boolean> {
  try {
    const text = String(content ?? "").trim();
    if (!text) return false;
    const title = deriveArchiveTitle(text);
    const { error } = await ctx.supabase.from("miscellaneous_items").insert(sanitizeMiscFields({
      user_id: ctx.userId,
      title,
      original_content: text,
      summary: `Ficou por tratar: ${reason}`,
      category: "Por tratar",
      source_channel: ctx.channel,
      source_message_id: ctx.sourceMessageId ?? null,
      occurred_at: new Date().toISOString(),
      status: "inbox",
      tags: ["falha_assessor"],
    }) as never);
    return !error;
  } catch {
    return false;
  }
}

// Frase honesta a acrescentar quando a mensagem ficou guardada.
const SAVED_SUFFIX = "Deixei em Diversos, por tratar, para não se perder.";

// Uma conversa constrói-se ao longo de várias mensagens. Se falharmos no
// último turno ("09:30"), arquivar só essa palavra deita fora o pedido real.
// Reconstruímos o conteúdo: a acção pendente (se existir) ou as últimas
// mensagens do consultor, mais a pergunta que o Assessor tinha feito.
export function buildArchiveContent(params: {
  trimmed: string;
  pendingContent?: string | null;
  recentRows?: Array<{ role?: string | null; content?: string | null; created_at?: string | null }>;
  // Só mensagens da mesma conversa contam como contexto. Sem isto, uma
  // conversa de há duas horas ("Casa Final B") era colada a um assunto
  // novo ("João Paulo 934 555 444") e o registo em Diversos ficava
  // ilegível.
  contextWindowMs?: number;
}): string {
  const last = String(params.trimmed ?? "").trim();
  const pending = String(params.pendingContent ?? "").trim();
  if (pending && pending !== last) return `${pending}\n(depois: ${last})`;

  // `recentRows` vem por ordem decrescente (mais recente primeiro).
  const windowMs = params.contextWindowMs ?? 20 * 60 * 1000;
  const now = Date.now();
  const rows = (params.recentRows ?? []).slice(0, 8).filter((r) => {
    const ts = r?.created_at ? Date.parse(String(r.created_at)) : NaN;
    if (Number.isNaN(ts)) return true;
    return now - ts <= windowMs;
  });
  const userMsgs = rows
    .filter((r) => r?.role === "user")
    .map((r) => String(r?.content ?? "").trim())
    .filter(Boolean)
    .filter((c) => c !== last)
    .filter((c) => !isDisposableMessage(c))
    .slice(0, 3)
    .reverse();
  const lastAssistantQuestion = rows
    .find((r) => r?.role === "assistant" && /\?\s*$/.test(String(r?.content ?? "").trim()));
  const question = String(lastAssistantQuestion?.content ?? "").trim();

  if (userMsgs.length === 0 && !question) return last;
  const context = [...userMsgs, question ? `Assessor: ${question}` : ""].filter(Boolean).join("\n");
  return `${context}\n(depois: ${last})`;
}

export function withSavedNote(reply: string, saved: boolean): string {
  const base = String(reply ?? "").trim();
  if (!saved) return base;
  if (/diversos/i.test(base)) return base;
  return base ? `${base} ${SAVED_SUFFIX}` : SAVED_SUFFIX;
}

// Ponto único de saída: decide, grava e devolve a resposta final.
export async function applySafetyNet(
  ctx: DomainContext,
  params: { content: string; outcome: TurnOutcome; reason?: string | null; reply: string },
): Promise<string> {
  if (!shouldArchiveTurn({ content: params.content, outcome: params.outcome })) {
    return String(params.reply ?? "").trim();
  }
  const saved = await archiveToMiscellaneous(
    ctx,
    params.content,
    params.reason || (
      params.outcome === "tool_failed" ? "não consegui guardar"
        : params.outcome === "service_down" ? "o serviço esteve indisponível"
        : "não percebi a mensagem"
    ),
  );
  return withSavedNote(params.reply, saved);
}
