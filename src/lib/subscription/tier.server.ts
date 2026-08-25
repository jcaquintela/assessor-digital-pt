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

export async function getEffectiveTierForCurrentRequest(): Promise<SubscriptionTier> {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];

  if (!supabaseUrl || !publishableKey) {
    console.error("[subscription] Missing backend configuration for effective tier lookup.");
    return FALLBACK_TIER;
  }

  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return FALLBACK_TIER;

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token || token.split(".").length !== 3) return FALLBACK_TIER;

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
  if (claimsError || !userId) return FALLBACK_TIER;

  const { data, error } = await supabase.rpc("effective_tier", { _user_id: userId });
  if (error) {
    console.error("[subscription] effective_tier lookup failed", error);
    return FALLBACK_TIER;
  }

  return normalizeTier(data as string | null);
}