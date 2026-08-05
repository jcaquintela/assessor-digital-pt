// Telemetria de produto — eventos discretos, sem conteúdo de conversa nem PII.
//
// Guardrail: lembretes enviados NÃO contam como valor. Só a confirmação
// explícita de contacto pelo consultor gera `prospecao_lead_contactado`.

export const TELEMETRY_EVENTS = {
  leadRegistado: "prospecao_lead_registado",
  leadContactado: "prospecao_lead_contactado",
} as const;

export type TelemetryEvent = (typeof TELEMETRY_EVENTS)[keyof typeof TELEMETRY_EVENTS];

interface TrackInput {
  userId: string;
  event: TelemetryEvent;
  leadId?: string | null;
  channel?: string | null;
  properties?: Record<string, unknown>;
}

/** Nunca deita abaixo o fluxo de negócio: falha em silêncio. */
export async function trackEvent(supabase: any, input: TrackInput): Promise<void> {
  try {
    await supabase.from("product_telemetry_events").insert({
      user_id: input.userId,
      event: input.event,
      lead_id: input.leadId ?? null,
      channel: input.channel ?? null,
      properties: input.properties ?? {},
      occurred_at: new Date().toISOString(),
    } as never);
  } catch {
    /* telemetria é best-effort */
  }
}

export function hoursBetween(fromISO: string | null | undefined, to = new Date()): number | null {
  if (!fromISO) return null;
  const from = new Date(fromISO).getTime();
  if (!Number.isFinite(from)) return null;
  return Math.round(((to.getTime() - from) / 36e5) * 10) / 10;
}

/** Fonte do registo da lead: foto (placa analisada) ou manual. */
export function leadSource(input: { image_file_id?: string | null }): "foto" | "manual" {
  return input.image_file_id ? "foto" : "manual";
}
