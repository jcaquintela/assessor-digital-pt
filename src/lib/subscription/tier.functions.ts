import { createServerFn } from "@tanstack/react-start";
import type { TierLookupResult } from "./tier.server";
import { getEffectiveTierForCurrentRequest } from "./tier.server";

// Devolve o tier efetivo do utilizador (aplica beta override) via RPC.
// Nunca ler `profiles.subscription_tier` directamente para gating —
// passa sempre por aqui / effective_tier() na BD.
// Não lança em falha de autorização: devolve o tier base e a razão, para o
// cliente poder avisar o consultor sem ecrã branco.
export const getMyEffectiveTier = createServerFn({ method: "GET" })
  .handler(async (): Promise<TierLookupResult> => {
    return getEffectiveTierForCurrentRequest();
  });
