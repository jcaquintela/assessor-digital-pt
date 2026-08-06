// Leitura da tabela de tarifas e cálculo do custo de um envio.

import { estimateTemplateCost, type CostEstimate, type TemplateRate } from "./pricing";

export async function loadTemplateRates(supabase: any): Promise<TemplateRate[]> {
  try {
    const { data } = await supabase
      .from("whatsapp_template_rates")
      .select("category, country_code, price_eur, currency, effective_from, source")
      .order("effective_from", { ascending: false })
      .limit(200);
    return Array.isArray(data) ? (data as TemplateRate[]) : [];
  } catch {
    return [];
  }
}

export async function priceSend(
  supabase: any,
  input: {
    isTemplate: boolean;
    outsideWindow: boolean | null;
    category?: string | null;
    toPhone: string;
    at?: Date;
  },
): Promise<CostEstimate> {
  const rates = await loadTemplateRates(supabase);
  return estimateTemplateCost({ ...input, rates });
}

/** Horas desde a última mensagem recebida do consultor nesse canal. */
export async function hoursSinceLastInbound(
  supabase: any,
  userId: string | null,
  channel = "whatsapp",
): Promise<number | null> {
  if (!userId) return null;
  const { data } = await supabase
    .from("assessor_messages")
    .select("created_at")
    .eq("user_id", userId)
    .eq("channel", channel)
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(1);
  const last = (data as any[])?.[0]?.created_at;
  if (!last) return null;
  return (Date.now() - Date.parse(last)) / 3_600_000;
}
