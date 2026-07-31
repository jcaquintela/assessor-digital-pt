// TelegramProvider — abstração fina sobre o Bot API para nos deixar trocar
// o transporte (connector Lovable, chamada directa, mock em testes) sem
// tocar no webhook ou no motor. Nesta fase usamos o connector Lovable
// (gateway) autenticado com LOVABLE_API_KEY + TELEGRAM_API_KEY.

import { formatForTelegram, TELEGRAM_PARSE_MODE } from "./telegram-format";

export interface TelegramSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  status?: number;
}


export interface TelegramProvider {
  sendText(input: {
    chatId: string;
    text: string;
    replyToMessageId?: string | number | null;
  }): Promise<TelegramSendResult>;

  sendOptions(input: {
    chatId: string;
    text: string;
    options: Array<{ label: string; callbackData: string }>;
  }): Promise<TelegramSendResult>;

  answerCallback(input: {
    callbackQueryId: string;
    text?: string;
    showAlert?: boolean;
  }): Promise<{ ok: boolean; error?: string }>;

  getFile(input: { fileId: string }): Promise<{
    ok: boolean;
    filePath?: string;
    sizeBytes?: number;
    mimeType?: string;
    error?: string;
  }>;

  downloadFile(input: { filePath: string }): Promise<{
    ok: boolean;
    buffer?: Uint8Array;
    mimeType?: string;
    error?: string;
  }>;
}

const GATEWAY_BASE = "https://connector-gateway.lovable.dev/telegram";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not configured`);
  return v;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${requireEnv("LOVABLE_API_KEY")}`,
    "X-Connection-Api-Key": requireEnv("TELEGRAM_API_KEY"),
  };
}

async function gatewayCall(
  method: string,
  body: unknown,
): Promise<{ ok: boolean; result?: any; error?: string; status?: number }> {
  try {
    const res = await fetch(`${GATEWAY_BASE}/${method}`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const text = await res.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* ignore */ }
    if (!res.ok || (parsed && parsed.ok === false)) {
      return { ok: false, status: res.status, error: parsed?.description ?? text ?? `HTTP ${res.status}` };
    }
    return { ok: true, result: parsed?.result ?? parsed, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export const lovableTelegramProvider: TelegramProvider = {
  async sendText({ chatId, text, replyToMessageId }) {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: formatForTelegram(text),
      parse_mode: TELEGRAM_PARSE_MODE,
    };
    if (replyToMessageId) body.reply_parameters = { message_id: Number(replyToMessageId) };
    let r = await gatewayCall("sendMessage", body);
    // Fail-safe: se o Telegram recusar o HTML, reenvia em texto simples
    // para nunca perdermos a mensagem por causa de formatação.
    if (!r.ok && /parse|entit|tag/i.test(r.error ?? "")) {
      r = await gatewayCall("sendMessage", { ...body, text: String(text ?? ""), parse_mode: undefined });
    }
    return {
      ok: r.ok,
      messageId: r.result?.message_id ? String(r.result.message_id) : undefined,
      error: r.error,
      status: r.status,
    };
  },

  async sendOptions({ chatId, text, options }) {
    const keyboard = options.map((o) => [{ text: o.label, callback_data: o.callbackData.slice(0, 64) }]);
    const base = {
      chat_id: chatId,
      text: formatForTelegram(text),
      parse_mode: TELEGRAM_PARSE_MODE,
      reply_markup: { inline_keyboard: keyboard },
    };
    let r = await gatewayCall("sendMessage", base);
    if (!r.ok && /parse|entit|tag/i.test(r.error ?? "")) {
      r = await gatewayCall("sendMessage", { ...base, text: String(text ?? ""), parse_mode: undefined });
    }
    return {
      ok: r.ok,
      messageId: r.result?.message_id ? String(r.result.message_id) : undefined,
      error: r.error,
      status: r.status,
    };
  },

  async answerCallback({ callbackQueryId, text, showAlert }) {
    const r = await gatewayCall("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
      ...(showAlert ? { show_alert: true } : {}),
    });
    return { ok: r.ok, error: r.error };
  },

  async getFile({ fileId }) {
    const r = await gatewayCall("getFile", { file_id: fileId });
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, filePath: r.result?.file_path, sizeBytes: r.result?.file_size };
  },

  async downloadFile({ filePath }) {
    try {
      const res = await fetch(`${GATEWAY_BASE}/file/${filePath}`, { headers: authHeaders() });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const buf = new Uint8Array(await res.arrayBuffer());
      return { ok: true, buffer: buf, mimeType: res.headers.get("content-type") ?? undefined };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};

// Override em memória usado apenas pelo self-test end-to-end de onboarding
// (evita chamadas reais ao Bot API para um chat_id sintético). Nunca deve
// ficar activo fora da execução do teste — o teste repõe sempre a null.
let providerOverride: TelegramProvider | null = null;

export function setTelegramProviderOverride(p: TelegramProvider | null): void {
  providerOverride = p;
}

export function getTelegramProvider(): TelegramProvider {
  return providerOverride ?? lovableTelegramProvider;
}

// Derived shared secret used by Telegram's X-Telegram-Bot-Api-Secret-Token header.
// Same value on our webhook (verifies) and on setWebhook (registers).
export async function deriveTelegramWebhookSecret(): Promise<string> {
  const key = requireEnv("TELEGRAM_API_KEY");
  const enc = new TextEncoder().encode(`telegram-webhook:${key}`);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return base64url(new Uint8Array(digest));
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  const b64 = typeof btoa === "function" ? btoa(s) : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
