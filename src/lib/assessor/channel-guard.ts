// Isolamento de testes — nenhuma corrida automática (CI, E2E, scripts de
// verificação) pode voltar a escrever na conta real de um consultor.
//
// Causa do incidente 2026-07-29: um harness de verificação invocou o motor
// directamente com canais improvisados ("web-ci-commission-<ts>-N") usando o
// user_id de produção. O motor aceitava qualquer string como canal, por isso
// as escritas caíram na conta real (4 comissões fantasma de 5.000 €).
//
// Regra: o motor só escreve quando o canal é um dos canais reais do produto.
// Qualquer outro canal é tratado como ambiente de teste e o turno é recusado
// sem tocar na base de dados — a não ser que um ambiente de teste explícito
// permita (ASSESSOR_ALLOW_TEST_CHANNELS=true), o que nunca acontece em produção.

export const REAL_CHANNELS = ["whatsapp", "telegram", "dashboard", "app", "web"] as const;

export type RealChannel = (typeof REAL_CHANNELS)[number];

export function isRealChannel(channel: string | null | undefined): boolean {
  return REAL_CHANNELS.includes(String(channel ?? "").trim().toLowerCase() as RealChannel);
}

export function isTestChannel(channel: string | null | undefined): boolean {
  return !isRealChannel(channel);
}

function testWritesAllowed(): boolean {
  try {
    return String(process.env["ASSESSOR_ALLOW_TEST_CHANNELS"] ?? "").toLowerCase() === "true";
  } catch {
    return false;
  }
}

/**
 * Devolve `null` quando o turno pode prosseguir, ou a razão do bloqueio.
 * Chamado à entrada do motor, antes de qualquer leitura ou escrita.
 */
export function blockedChannelReason(channel: string | null | undefined): string | null {
  if (isRealChannel(channel)) return null;
  if (testWritesAllowed()) return null;
  return `test_channel_blocked:${String(channel ?? "").slice(0, 60)}`;
}
