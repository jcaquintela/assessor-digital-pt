// Transcrição de áudio via Lovable AI Gateway.
// Usa Gemini via /v1/chat/completions com input_audio para aceitar OGG/Opus (WhatsApp).

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

function mimeToGeminiFormat(mime: string): string | null {
  const m = mime.toLowerCase().split(";")[0].trim();
  if (m === "audio/ogg" || m === "audio/opus") return "ogg";
  if (m === "audio/mpeg" || m === "audio/mp3") return "mp3";
  if (m === "audio/wav" || m === "audio/x-wav") return "wav";
  if (m === "audio/mp4" || m === "audio/m4a" || m === "audio/x-m4a") return "m4a";
  if (m === "audio/webm") return "webm";
  if (m === "audio/aac") return "aac";
  if (m === "audio/flac") return "flac";
  return null;
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export type TranscribeResult = { ok: true; text: string } | { ok: false; error: string };

export async function transcribeAudio(bytes: Uint8Array, mimeType: string): Promise<TranscribeResult> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return { ok: false, error: "LOVABLE_API_KEY missing" };
  const fmt = mimeToGeminiFormat(mimeType);
  if (!fmt) return { ok: false, error: `Unsupported audio mime: ${mimeType}` };

  const body = {
    model: "google/gemini-3.6-flash",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Transcreve integralmente esta mensagem de voz em português europeu (PT-PT). Responde apenas com a transcrição, sem prefácios nem comentários.",
          },
          { type: "input_audio", input_audio: { data: toBase64(bytes), format: fmt } },
        ],
      },
    ],
    temperature: 0,
  };

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: `Gateway ${res.status}: ${t.slice(0, 300)}` };
  }
  const json = (await res.json()) as any;
  const text: string | undefined = json?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") return { ok: false, error: "Gateway returned no content" };
  return { ok: true, text: text.trim() };
}