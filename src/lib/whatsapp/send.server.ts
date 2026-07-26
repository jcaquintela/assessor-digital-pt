// Server-only helper to send a WhatsApp text via the Meta Cloud API.
// Never import from client code.

export type SendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; error: string };

export async function sendWhatsAppText(to: string, body: string): Promise<SendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return { ok: false, error: "WhatsApp credentials not configured" };
  }

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body, preview_url: false },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      // Do NOT log the token; log status + error message only.
      const msg = json?.error?.message ?? `HTTP ${res.status}`;
      console.error("[whatsapp-send] falha:", res.status, msg);
      return { ok: false, error: msg };
    }
    const messageId: string | null = json?.messages?.[0]?.id ?? null;
    return { ok: true, messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[whatsapp-send] erro de rede:", msg);
    return { ok: false, error: msg };
  }
}