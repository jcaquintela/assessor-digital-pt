// Gate do módulo de Email (plano Pro).
//
// Regra do produto (15/08): o email é uma funcionalidade do plano Pro.
// `past_due` NÃO corta o acesso — uma retentativa de pagamento não deve
// deixar o consultor sem a caixa de correio a meio do dia. Só um plano
// abaixo de Pro (após downgrade efetivo) fecha o módulo.
//
// Ficheiro puro e seguro para o browser: recebe o tier já resolvido por
// `effective_tier()` e devolve capacidades. Servidor e UI importam daqui.
import { tierAtLeast, type SubscriptionTier } from "./tiers";

export const EMAIL_MIN_TIER: SubscriptionTier = "pro";

export function canUseEmailModule(
  tier: string | null | undefined,
  _billingStatus?: string | null,
): boolean {
  return tierAtLeast(tier, EMAIL_MIN_TIER);
}

/** Mensagem para o consultor quando o plano não chega (conversa). */
export const EMAIL_PLAN_REQUIRED_REPLY =
  "A leitura do email faz parte do plano Pro. Se quiseres que eu trate também da tua caixa de correio, "
  + "muda de plano em Subscrição e ligo-a logo a seguir.";

/** Erro devolvido pelo servidor quando alguém tenta ligar sem plano. */
export const EMAIL_PLAN_REQUIRED_ERROR =
  "O módulo de Email está disponível no plano Pro.";
