import { createClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";

import type { Database } from "@/integrations/supabase/types";
import { normalizeTier, type SubscriptionTier } from "./tiers";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

const FALLBACK_TIER: SubscriptionTier = "base";

/**
 * Porque é que o tier veio em fallback. Serve para logs no servidor e para o
 * cliente poder mostrar um aviso amigável em vez de um ecrã em branco.
 * - `missing_config`: backend mal configurado (problema nosso).
 * - `no_bearer` / `malformed_token`: pedido chegou sem sessão válida.
 * - `invalid_claims`: token presente mas rejeitado (expirado/revogado).
 * - `rpc_failed`: `effective_tier()` falhou na base de dados.
 */
export type TierLookupReason =
  | "missing_config"
  | "no_bearer"
  | "malformed_token"
  | "invalid_claims"
  | "rpc_failed";

export type TierLookupResult = {
  tier: SubscriptionTier;
  /** Ausente quando o tier foi lido com sucesso. */
  reason?: TierLookupReason;
};

/** Estas razões significam "falha de autorização", não avaria do backend. */
const AUTH_REASONS: ReadonlySet<TierLookupReason> = new Set([
  "no_bearer",
  "malformed_token",
  "invalid_claims",
]);

export function isTierAuthReason(reason: TierLookupReason | undefined): boolean {
  return !!reason && AUTH_REASONS.has(reason);
}

function logTierFallback(reason: TierLookupReason, detail?: unknown) {
  const payload = {
    scope: "subscription.effective_tier",
    reason,
    fallbackTier: FALLBACK_TIER,
    ...(detail === undefined ? {} : { detail }),
  };
  // Falhas de autorização são esperadas (sessão expirada, pedido sem bearer):
  // ficam em warn para não poluir o sinal de erro real do servidor.
  if (isTierAuthReason(reason)) console.warn("[subscription] tier lookup unauthorized", payload);
  else console.error("[subscription] tier lookup failed", payload);
}

export async function getEffectiveTierForCurrentRequest(): Promise<TierLookupResult> {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];

  if (!supabaseUrl || !publishableKey) {
    logTierFallback("missing_config");
    return { tier: FALLBACK_TIER, reason: "missing_config" };
  }

  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    logTierFallback("no_bearer");
    return { tier: FALLBACK_TIER, reason: "no_bearer" };
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token || token.split(".").length !== 3) {
    logTierFallback("malformed_token");
    return { tier: FALLBACK_TIER, reason: "malformed_token" };
  }

  const supabase = createClient<Database>(supabaseUrl, publishableKey, {
    global: {
      fetch: createSupabaseFetch(publishableKey),
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) {
    logTierFallback("invalid_claims", claimsError?.message);
    return { tier: FALLBACK_TIER, reason: "invalid_claims" };
  }

  const { data, error } = await supabase.rpc("effective_tier", { _user_id: userId });
  if (error) {
    logTierFallback("rpc_failed", error.message);
    return { tier: FALLBACK_TIER, reason: "rpc_failed" };
  }

  return { tier: normalizeTier(data as string | null) };
}
