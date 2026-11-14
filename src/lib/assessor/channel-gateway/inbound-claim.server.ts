// Reserva atómica de uma mensagem recebida (WhatsApp/Telegram/painel).
//
// O canal pode entregar a mesma mensagem duas vezes em simultâneo (reenvio
// do fornecedor). A verificação "já existe?" seguida de gravação deixa uma
// janela em que as duas entregas passam. Esta reserva fecha essa janela: só
// uma entrega obtém `true`; a outra sai sem resposta.
//
// Se o processamento morrer antes de a mensagem ficar gravada, a reserva
// expira (INBOUND_CLAIM_STALE_SECONDS) e um reenvio posterior volta a correr.
// Se a própria reserva falhar (ex.: base de dados sem a função), segue o
// comportamento anterior — nunca se perde uma mensagem por causa disto.

export const INBOUND_CLAIM_STALE_SECONDS = 600;

export type ClaimOutcome = "claimed" | "duplicate" | "unavailable";

export async function claimInboundMessage(
  supabaseAdmin: any,
  channel: string,
  externalMessageId: string | null | undefined,
): Promise<ClaimOutcome> {
  if (!externalMessageId) return "unavailable";
  try {
    if (typeof supabaseAdmin?.rpc !== "function") return "unavailable";
    const { data, error } = await supabaseAdmin.rpc("claim_inbound_message", {
      _channel: channel,
      _external_id: externalMessageId,
      _stale_seconds: INBOUND_CLAIM_STALE_SECONDS,
    });
    if (error) {
      console.warn("[inbound-claim] reserva indisponível:", error.code ?? "", error.message ?? "");
      return "unavailable";
    }
    return data === true ? "claimed" : "duplicate";
  } catch (e) {
    console.warn("[inbound-claim] reserva falhou:", (e as Error)?.message ?? e);
    return "unavailable";
  }
}
