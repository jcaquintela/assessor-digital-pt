// Resumo de 3-5 palavras para dar nome legível a um ficheiro.
// Substitui o corte às primeiras palavras da transcrição: o nome passa a ser
// um resumo do assunto, nunca a fala literal.

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
// Etiqueta de 3-5 palavras não justifica um modelo de raciocínio: o gemini-3.6-flash
// gastava quase todos os max_tokens em reasoning e devolvia vazio (no_content).
// O flash-lite não tem modo de raciocínio — resposta directa, mais barata e rápida.
export const SHORT_NAME_MODEL = "google/gemini-2.5-flash-lite";
const MODEL = SHORT_NAME_MODEL;
const MAX_TOKENS = 40;

const PROMPT = `És o assessor de um consultor imobiliário português.
Recebes o conteúdo de um ficheiro (transcrição de voz, texto lido de um documento
ou de uma foto). Devolves APENAS um título curto em português europeu, com 3 a 5
palavras, que diga o ASSUNTO do ficheiro.
Regras:
- nunca copies a frase literal nem comeces por "Áudio sobre" ou "Foto de"
- sem aspas, sem ponto final, sem markdown, sem explicações
- se houver nome de pessoa, morada ou zona relevante, inclui-o
Exemplos: "Visita angariação Canedo quinta", "Cartão de visita Nuno Castilho", "Caderneta predial Rua Flores".`;

export type ShortNameResult = { ok: true; summary: string } | { ok: false; error: string };

export async function summarizeForName(
  text: string,
  telemetry?: import("./usage-log.server").AiTelemetry,
): Promise<ShortNameResult> {
  const content = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 4000);
  if (content.length < 8) return { ok: false, error: "texto insuficiente" };
  const key = process.env['LOVABLE_API_KEY'];
  if (!key) return { ok: false, error: "LOVABLE_API_KEY missing" };

  const t0 = Date.now();
  const { logAiUsage, readGatewayUsage } = await import("./usage-log.server");
  try {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: PROMPT },
          { role: "user", content },
        ],
        temperature: 0,
        max_tokens: MAX_TOKENS,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      await logAiUsage(telemetry, {
        modality: "texto", model: MODEL, intent: "short_file_name",
        tokens: { input: 0, output: 0 }, latencyMs: Date.now() - t0,
        success: false, error: `Gateway ${res.status}`,
      });
      return { ok: false, error: `Gateway ${res.status}: ${t.slice(0, 200)}` };
    }
    const json = (await res.json()) as any;
    const choice = json?.choices?.[0];
    const finishReason: string = String(choice?.finish_reason ?? "");
    const raw: string | undefined = choice?.message?.content;
    // Resposta truncada nunca vira nome de ficheiro: fica lixo cortado a meio.
    // Falhamos de forma segura e o chamador mantém o nome de recurso.
    const truncated = finishReason === "length" || finishReason === "MAX_TOKENS";
    const summary = truncated ? undefined : raw;
    await logAiUsage(telemetry, {
      modality: "texto", model: MODEL, intent: "short_file_name",
      tokens: readGatewayUsage(json), latencyMs: Date.now() - t0,
      success: !!summary,
      error: summary ? null : truncated ? "truncated_response" : "no_content",
    });
    if (truncated) return { ok: false, error: "resposta truncada" };
    if (!summary) return { ok: false, error: "sem conteúdo" };
    return { ok: true, summary: summary.trim() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "erro" };
  }
}
