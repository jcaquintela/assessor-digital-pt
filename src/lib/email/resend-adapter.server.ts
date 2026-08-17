import { BRAND_NAME } from "@/lib/brand";
import type { EmailMessage, EmailProvider, EmailSendResult } from "./provider";

// Remetente real: domínio meuafonso.com verificado no Resend.
// (Antes era `onboarding@resend.dev`, que só entregava ao dono da conta.)
const FROM = `${BRAND_NAME} <ola@meuafonso.com>`;

// Enviamos pelo connector gateway da Lovable (credenciais geridas pelo
// conector Resend: LOVABLE_API_KEY + RESEND_API_KEY). Não há chave manual.
const ENDPOINT = "https://connector-gateway.lovable.dev/resend/emails";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toHtml(body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1b1a17;max-width:560px">${paragraphs}</div>`;
}

export const resendEmailProvider: EmailProvider = {
  name: "resend",
  async send(message: EmailMessage): Promise<EmailSendResult> {
    // As chaves são lidas sempre aqui dentro — nunca no topo do módulo.
    const lovableKey = process.env.LOVABLE_API_KEY;
    const connectionKey = process.env.RESEND_API_KEY;
    if (!lovableKey || !connectionKey) {
      return { success: false, error: "conector Resend não ligado ao projeto" };
    }

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": connectionKey,
        },
        body: JSON.stringify({
          from: FROM,
          to: [message.to],
          subject: message.subject,
          text: message.body,
          html: toHtml(message.body),
        }),
      });

      const raw = await res.text();
      if (!res.ok) {
        let detail = raw.slice(0, 300);
        try {
          const parsed = JSON.parse(raw) as { message?: string; name?: string };
          if (parsed.message) detail = parsed.message;
        } catch {
          /* corpo não-JSON: fica o texto cru */
        }
        return { success: false, error: `Resend ${res.status}: ${detail}` };
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "falha de rede ao contactar o Resend" };
    }
  },
};