// Envio de mensagens interativas (Reply Buttons e List Messages) pela
// Meta Cloud API. Nunca bloqueia a conversa: quem chama trata o fallback
// para texto simples quando isto falhar (ex.: fora da janela de 24h).

import type { InteractivePrompt } from "@/lib/assessor/interactive";
import { BUTTON_LABEL_MAX, LIST_LABEL_MAX, MAX_BUTTONS, MAX_LIST_ROWS } from "@/lib/assessor/interactive";
import { sendWhatsAppPayload, type SendResult } from "./send.server";

const BODY_MAX = 1024;

function cut(s: string, max: number): string {
  const t = String(s ?? "").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

export async function sendWhatsAppInteractive(
  to: string,
  prompt: InteractivePrompt,
  opts: { triggeredBy?: string | null; kind?: "auto" | "test" } = {},
): Promise<SendResult> {
  const { formatForWhatsApp } = await import("@/lib/assessor/culture/whatsapp-format");
  const body = cut(formatForWhatsApp(prompt.body) || prompt.body, BODY_MAX);

  if (prompt.kind === "buttons") {
    const buttons = prompt.options.slice(0, MAX_BUTTONS).map((o) => ({
      type: "reply",
      reply: { id: o.id, title: cut(o.label, BUTTON_LABEL_MAX) },
    }));
    return sendWhatsAppPayload(
      to,
      {
        type: "interactive",
        interactive: { type: "button", body: { text: body }, action: { buttons } },
      },
      opts,
    );
  }

  const rows = prompt.options.slice(0, MAX_LIST_ROWS).map((o) => ({
    id: o.id,
    title: cut(o.label, LIST_LABEL_MAX),
    ...(o.description ? { description: cut(o.description, 72) } : {}),
  }));
  return sendWhatsAppPayload(
    to,
    {
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: body },
        action: {
          button: cut(prompt.listButtonLabel || "Ver opções", BUTTON_LABEL_MAX),
          sections: [{ title: "Opções", rows }],
        },
      },
    },
    opts,
  );
}
