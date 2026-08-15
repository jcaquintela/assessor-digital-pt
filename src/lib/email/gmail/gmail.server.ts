// Acesso ao Gmail pelo connector gateway (App User Connector, por consultor).
//
// Regras não negociáveis:
// - Só lemos (`gmail.readonly`) e criamos rascunhos (`gmail.compose`).
// - Nunca existe caminho de envio automático: enviar é sempre uma acção
//   confirmada pelo consultor (ver `confirmAndSendDraft`).
// - Nunca guardamos o corpo do email na base de dados: só snippet + resumo.
//   O corpo é lido on-demand e usado em memória.

import { GATEWAY_BASE_URL, GMAIL_API_BASE, GMAIL_CONNECTOR_ID } from "./provider";
import { isAuthError, expiredMessage } from "./reauth";

export class GmailAuthExpiredError extends Error {
  constructor() {
    super(expiredMessage());
    this.name = "GmailAuthExpiredError";
  }
}

async function callGmail(
  connectionKey: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<any> {
  const lovableKey = process.env['LOVABLE_API_KEY'];
  if (!lovableKey) throw new Error("LOVABLE_API_KEY em falta");
  const res = await fetch(`${GATEWAY_BASE_URL}/${GMAIL_CONNECTOR_ID}${GMAIL_API_BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connectionKey,
      "Content-Type": "application/json",
    },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
  if (!res.ok) {
    const body = await res.text();
    if (isAuthError(res.status, body)) throw new GmailAuthExpiredError();
    console.error(`Gmail gateway falhou [${res.status}]: ${body}`);
    throw new Error(`Gmail respondeu ${res.status}: ${body}`);
  }
  return res.json();
}

export type GmailMessageHead = {
  id: string;
  threadId: string;
  from: string | null;
  to: string[];
  subject: string | null;
  snippet: string | null;
  sentAt: string | null;
  isRead: boolean;
};

function header(headers: any[], name: string): string | null {
  const h = (headers ?? []).find(
    (x: any) => String(x?.name ?? "").toLowerCase() === name.toLowerCase(),
  );
  return h?.value ?? null;
}

export function toMessageHead(raw: any): GmailMessageHead {
  const headers = raw?.payload?.headers ?? [];
  const labels: string[] = raw?.labelIds ?? [];
  return {
    id: String(raw?.id ?? ""),
    threadId: String(raw?.threadId ?? ""),
    from: header(headers, "From"),
    to: String(header(headers, "To") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    subject: header(headers, "Subject"),
    snippet: raw?.snippet ?? null,
    sentAt: raw?.internalDate ? new Date(Number(raw.internalDate)).toISOString() : null,
    isRead: !labels.includes("UNREAD"),
  };
}

/** Lista mensagens recentes (metadados + snippet, nunca o corpo). */
export async function listRecentMessages(
  connectionKey: string,
  opts?: { max?: number; query?: string },
): Promise<GmailMessageHead[]> {
  const params = new URLSearchParams({ maxResults: String(opts?.max ?? 15) });
  if (opts?.query) params.set("q", opts.query);
  const list = await callGmail(connectionKey, `/users/me/messages?${params}`);
  const ids: string[] = (list?.messages ?? []).map((m: any) => m.id);
  const out: GmailMessageHead[] = [];
  for (const id of ids) {
    const raw = await callGmail(connectionKey, `/users/me/messages/${id}?format=metadata`);
    out.push(toMessageHead({ ...raw, id }));
  }
  return out;
}

/** Corpo completo, lido on-demand. Não é persistido. */
export async function fetchMessageBody(connectionKey: string, messageId: string): Promise<string> {
  const raw = await callGmail(connectionKey, `/users/me/messages/${messageId}?format=full`);
  return extractPlainText(raw?.payload) || String(raw?.snippet ?? "");
}

export function extractPlainText(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  for (const part of payload.parts ?? []) {
    const t = extractPlainText(part);
    if (t) return t;
  }
  return "";
}

export function decodeBase64Url(data: string): string {
  const b64 = String(data).replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return "";
  }
}

export function buildRawEmail(to: string[], subject: string, body: string): string {
  const msg = [
    `To: ${to.join(", ")}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
  ].join("\r\n");
  return Buffer.from(msg, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Cria rascunho no Gmail. Nunca envia — só `gmail.compose`. */
export async function createDraft(
  connectionKey: string,
  args: { to: string[]; subject: string; body: string; threadId?: string | null },
): Promise<{ draftId: string }> {
  const message: any = { raw: buildRawEmail(args.to, args.subject, args.body) };
  if (args.threadId) message.threadId = args.threadId;
  const res = await callGmail(connectionKey, "/users/me/drafts", {
    method: "POST",
    body: { message },
  });
  return { draftId: String(res?.id ?? "") };
}

/**
 * Envio: só depois de o consultor confirmar explicitamente.
 * O `confirmed` não é decorativo — sem ele isto rebenta de propósito, para
 * nenhum caminho futuro conseguir enviar email às escondidas.
 */
export async function confirmAndSendDraft(
  connectionKey: string,
  draftId: string,
  confirmed: boolean,
): Promise<{ sent: boolean }> {
  if (!confirmed) {
    throw new Error("Rascunho não confirmado pelo consultor — envio bloqueado.");
  }
  await callGmail(connectionKey, "/users/me/drafts/send", {
    method: "POST",
    body: { id: draftId },
  });
  return { sent: true };
}