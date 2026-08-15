// Resumo de email — só corre quando o consultor pede.
// O corpo é lido on-demand e nunca é gravado: guardamos apenas o resumo.

import { isSummaryRequest } from "./summary";
import type { MailProvider } from "../providers";

async function readBody(provider: MailProvider, key: string, id: string): Promise<string> {
  if (provider === "outlook") {
    const m = await import("../outlook/outlook.server");
    return m.fetchMessageBody(key, id);
  }
  const g = await import("./gmail.server");
  return g.fetchMessageBody(key, id);
}

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.6-flash";

export async function summarizeEmailOnRequest(args: {
  connectionKey: string;
  messageId: string;
  subject?: string | null;
  requestText: string;
  provider?: MailProvider;
}): Promise<{ summary: string | null; skipped: "not_requested" | null }> {
  if (!isSummaryRequest(args.requestText)) {
    return { summary: null, skipped: "not_requested" };
  }
  const body = await readBody(args.provider ?? "gmail", args.connectionKey, args.messageId);
  const key = process.env['LOVABLE_API_KEY'];
  if (!key) throw new Error("LOVABLE_API_KEY em falta");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content:
            "És o Afonso, assessor de um consultor imobiliário português. Resume o email em PT-PT, 2 a 3 frases, tratamento por tu, sem jargão. Diz o que a pessoa quer e o que fica por fazer.",
        },
        {
          role: "user",
          content: `Assunto: ${args.subject ?? "(sem assunto)"}\n\n${body.slice(0, 8000)}`,
        },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error(`Resumo de email falhou [${res.status}]: ${t}`);
    throw new Error(`Resumo falhou [${res.status}]`);
  }
  const json = await res.json();
  const summary = json?.choices?.[0]?.message?.content?.trim() ?? null;
  return { summary, skipped: null };
}