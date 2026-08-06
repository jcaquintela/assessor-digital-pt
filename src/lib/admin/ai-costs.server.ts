// Custo de "run usage" atribuível a cada consultor.
//
// Só entra aqui aquilo que a atividade real do consultor gera: chamadas ao
// motor, OCR de documentos, leitura de imagens e transcrição de áudio
// (`assessor_ai_logs`) e mensagens WhatsApp enviadas em nome dele
// (`whatsapp_send_logs`). O consumo de build (pedidos de desenvolvimento ao
// Lovable) NÃO é atribuível a ninguém e fica de fora por definição.

export type ModalityCost = {
  modality: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  credits: number;
};

export type UserAiCost = {
  credits: number;
  calls: number;
  byModality: ModalityCost[];
};

const DEFAULT_MODEL = "google/gemini-3.6-flash";
const FALLBACK_RATE = { input: 6, output: 30 }; // créditos por 1M tokens

type Rate = { input: number; output: number };

export async function loadRates(supabaseAdmin: any): Promise<Map<string, Rate>> {
  const { data } = await supabaseAdmin
    .from("ai_model_rates")
    .select("model, credits_per_1m_input, credits_per_1m_output");
  const map = new Map<string, Rate>();
  for (const r of (data ?? []) as any[]) {
    map.set(r.model, {
      input: Number(r.credits_per_1m_input) || 0,
      output: Number(r.credits_per_1m_output) || 0,
    });
  }
  if (!map.has(DEFAULT_MODEL)) map.set(DEFAULT_MODEL, FALLBACK_RATE);
  return map;
}

export async function creditPriceEur(supabaseAdmin: any): Promise<number | null> {
  const { data } = await supabaseAdmin
    .from("admin_cost_settings")
    .select("value")
    .eq("key", "credit_price_eur")
    .maybeSingle();
  const v = Number((data as any)?.value);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function labelModality(row: any): string {
  if (row.modality) return row.modality;
  // Registos antigos não têm modalidade: tudo o que passou pelo motor é texto.
  return "texto";
}

/** Créditos de IA por utilizador nos últimos `days` dias. */
export async function aiCostsByUser(
  supabaseAdmin: any,
  userIds: string[],
  days = 30,
): Promise<Map<string, UserAiCost>> {
  const out = new Map<string, UserAiCost>();
  if (!userIds.length) return out;
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const rates = await loadRates(supabaseAdmin);

  const rows: any[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("assessor_ai_logs")
      .select("user_id, modality, billed_model, model, input_tokens, output_tokens")
      .in("user_id", userIds)
      .gte("created_at", since)
      .range(from, from + pageSize - 1);
    if (error) break;
    const chunk = (data ?? []) as any[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }

  for (const r of rows) {
    const uid = r.user_id as string;
    if (!uid) continue;
    const modelKey = r.billed_model ?? (r.model && r.model.includes("/") ? r.model : DEFAULT_MODEL);
    const rate = rates.get(modelKey) ?? rates.get(DEFAULT_MODEL) ?? FALLBACK_RATE;
    const inTok = Number(r.input_tokens) || 0;
    const outTok = Number(r.output_tokens) || 0;
    const credits = (inTok / 1e6) * rate.input + (outTok / 1e6) * rate.output;

    const entry = out.get(uid) ?? { credits: 0, calls: 0, byModality: [] };
    entry.credits += credits;
    entry.calls += 1;
    const mod = labelModality(r);
    let bucket = entry.byModality.find((b) => b.modality === mod);
    if (!bucket) {
      bucket = { modality: mod, calls: 0, inputTokens: 0, outputTokens: 0, credits: 0 };
      entry.byModality.push(bucket);
    }
    bucket.calls += 1;
    bucket.inputTokens += inTok;
    bucket.outputTokens += outTok;
    bucket.credits += credits;
    out.set(uid, entry);
  }

  for (const entry of out.values()) entry.byModality.sort((a, b) => b.credits - a.credits);
  return out;
}

/** Custo WhatsApp (€) por utilizador, já estimado nos registos de envio. */
export async function whatsappCostByUser(
  supabaseAdmin: any,
  userIds: string[],
  days = 30,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!userIds.length) return out;
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { data } = await supabaseAdmin
    .from("whatsapp_send_logs")
    .select("user_id, estimated_cost_eur")
    .in("user_id", userIds)
    .gte("created_at", since);
  for (const r of (data ?? []) as any[]) {
    const v = Number(r.estimated_cost_eur) || 0;
    if (!r.user_id || !v) continue;
    out.set(r.user_id, (out.get(r.user_id) ?? 0) + v);
  }
  return out;
}

/** Preço mensal (€) por tier, tal como configurado nos planos. */
export async function planPricesByTier(supabaseAdmin: any): Promise<Map<string, number | null>> {
  const { data } = await supabaseAdmin.from("plan_configs").select("tier, price_month");
  const map = new Map<string, number | null>();
  for (const r of (data ?? []) as any[]) {
    const v = Number(r.price_month);
    map.set(r.tier, Number.isFinite(v) ? v : null);
  }
  return map;
}