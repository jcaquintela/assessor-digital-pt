// Acesso ao Outlook Mail pelo Microsoft Graph (App User Connector, por consultor).
//
// Regras não negociáveis (as mesmas do Gmail):
// - Só lemos (`Mail.Read`) e criamos rascunhos (`Mail.ReadWrite`).
// - Nunca pedimos `Mail.Send`: não existe caminho de envio automático.
// - Nunca guardamos o corpo do email na base de dados: só snippet + resumo.

import { callAsAppUser } from "@/integrations/lovable/appUserConnector";
import { GATEWAY_BASE_URL, OUTLOOK_CONNECTOR_ID } from "./provider";
import type { MailMessageHead } from "../message";

export class OutlookAuthExpiredError extends Error {
  constructor() {
    super("Perdi o acesso ao teu email do Outlook. Volta a ligar em Definições e continuo daí.");
    this.name = "OutlookAuthExpiredError";
  }
}

async function callGraph(
  connectionKey: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<any> {
  const res = await callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectorId: OUTLOOK_CONNECTOR_ID,
    connectionAPIKey: connectionKey,
    path,
    init: {
      method: init?.method ?? "GET",
      headers: { "Content-Type": "application/json" },
      ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) throw new OutlookAuthExpiredError();
    console.error(`Outlook gateway falhou [${res.status}]: ${body}`);
    throw new Error(`Outlook respondeu ${res.status}: ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

/** Cabeçalho "Nome <email>" a partir do objecto estruturado do Graph. */
export function graphAddress(raw: any): string | null {
  const addr = raw?.emailAddress;
  if (!addr) return null;
  const email = String(addr.address ?? "").trim();
  const name = String(addr.name ?? "").trim();
  if (!email) return name || null;
  return name && name.toLowerCase() !== email.toLowerCase() ? `${name} <${email}>` : email;
}

export function toMessageHead(raw: any): MailMessageHead {
  return {
    id: String(raw?.id ?? ""),
    threadId: String(raw?.conversationId ?? raw?.id ?? ""),
    from: graphAddress(raw?.from ?? raw?.sender),
    to: (raw?.toRecipients ?? []).map((r: any) => graphAddress(r)).filter(Boolean) as string[],
    subject: raw?.subject ?? null,
    snippet: raw?.bodyPreview ?? null,
    sentAt: raw?.receivedDateTime ?? raw?.sentDateTime ?? null,
    isRead: Boolean(raw?.isRead),
    // Sinais próprios da Microsoft que ajudam a triagem: o "Other" do
    // Focused Inbox e a pasta de lixo são ruído quase garantido.
    lowPriorityHint:
      String(raw?.inferenceClassification ?? "").toLowerCase() === "other" ||
      String(raw?.parentFolderId ?? "").toLowerCase() === "junkemail",
  };
}

/** Endereço da conta ligada — mostrado no cartão das Definições. */
export async function fetchOutlookProfile(
  connectionKey: string,
): Promise<{ emailAddress: string | null }> {
  const data = await callGraph(connectionKey, "/me?$select=mail,userPrincipalName");
  return { emailAddress: data?.mail ?? data?.userPrincipalName ?? null };
}

const HEAD_SELECT =
  "id,conversationId,subject,bodyPreview,receivedDateTime,isRead,from,toRecipients,inferenceClassification,parentFolderId";

export async function listRecentMessages(
  connectionKey: string,
  opts?: { max?: number; query?: string; onlyUnread?: boolean },
): Promise<MailMessageHead[]> {
  const top = Math.min(Math.max(opts?.max ?? 15, 1), 50);
  const params = new URLSearchParams({ $top: String(top), $select: HEAD_SELECT });
  const q = (opts?.query ?? "").trim();
  if (q) {
    // $search não combina com $orderby no Graph — a ordenação vem por relevância.
    params.set("$search", `"${q.replace(/"/g, "")}"`);
  } else {
    params.set("$orderby", "receivedDateTime desc");
    if (opts?.onlyUnread) params.set("$filter", "isRead eq false");
  }
  const data = await callGraph(connectionKey, `/me/messages?${params}`);
  return (data?.value ?? []).map(toMessageHead);
}

/** Corpo completo, lido on-demand. Não é persistido. */
export async function fetchMessageBody(
  connectionKey: string,
  messageId: string,
): Promise<string> {
  const raw = await callGraph(
    connectionKey,
    `/me/messages/${encodeURIComponent(messageId)}?$select=body,bodyPreview`,
  );
  const content = String(raw?.body?.content ?? "");
  const type = String(raw?.body?.contentType ?? "text").toLowerCase();
  const text = type === "html" ? stripHtml(content) : content;
  return text.trim() || String(raw?.bodyPreview ?? "");
}

export function stripHtml(html: string): string {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Cria rascunho no Outlook. Nunca envia — não temos `Mail.Send`. */
export async function createDraft(
  connectionKey: string,
  args: { to: string[]; subject: string; body: string },
): Promise<{ draftId: string }> {
  const res = await callGraph(connectionKey, "/me/messages", {
    method: "POST",
    body: {
      subject: args.subject,
      body: { contentType: "Text", content: args.body },
      toRecipients: args.to.map((address) => ({ emailAddress: { address } })),
      isDraft: true,
    },
  });
  return { draftId: String(res?.id ?? "") };
}
