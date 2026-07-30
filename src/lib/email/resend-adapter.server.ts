import type { EmailMessage, EmailProvider, EmailSendResult } from "./provider";

// Remetente de teste do Resend.
// ATENÇÃO: `onboarding@resend.dev` só entrega ao email do dono da conta Resend.
// Para qualquer outro destinatário o Resend devolve 403.
// >>> ISTO MUDA ASSIM QUE UM DOMÍNIO PRÓPRIO ESTIVER VERIFICADO NO RESEND:
// trocar por algo como "Assessor do Consultor <assessor@teudominio.pt>".
const FROM = "Assessor do Consultor <onboarding@resend.dev>";

const ENDPOINT = "https://api.resend.com/emails";

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
    // A chave é lida sempre aqui dentro — nunca no topo do módulo.
    const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
    if (!apiKey) return { success: false, error: "EMAIL_PROVIDER_API_KEY não configurada" };

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
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