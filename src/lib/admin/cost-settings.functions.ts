import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles: string[] = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("super_admin")) throw new Error("Forbidden: super admin only");
}

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles: string[] = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("super_admin") && !roles.includes("support_admin")) {
    throw new Error("Forbidden: admin only");
  }
}

export type AiRateRow = {
  model: string;
  creditsPerMillionInput: number;
  creditsPerMillionOutput: number;
  source: string | null;
};

export type AiCostSettings = {
  rates: AiRateRow[];
  creditPriceEur: number | null;
  /** Modelos que o Afonso usa mas ainda não têm tarifa definida. */
  missingRates: string[];
};

// Modelos efetivamente usados pelo produto (motor, visão, áudio, documentos).
const MODELS_IN_USE = ["google/gemini-3.6-flash", "openai/gpt-5.6-sol"];

export const getAiCostSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiCostSettings> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: rates }, { data: setting }] = await Promise.all([
      supabaseAdmin
        .from("ai_model_rates")
        .select("model, credits_per_1m_input, credits_per_1m_output, source")
        .order("model"),
      supabaseAdmin.from("admin_cost_settings").select("value").eq("key", "credit_price_eur").maybeSingle(),
    ]);
    const price = Number((setting as any)?.value);
    const known = new Set(((rates ?? []) as any[]).map((r) => r.model as string));
    return {
      rates: ((rates ?? []) as any[]).map((r) => ({
        model: r.model,
        creditsPerMillionInput: Number(r.credits_per_1m_input),
        creditsPerMillionOutput: Number(r.credits_per_1m_output),
        source: r.source ?? null,
      })),
      creditPriceEur: Number.isFinite(price) && price > 0 ? price : null,
      missingRates: MODELS_IN_USE.filter((m) => !known.has(m)),
    };
  });

export const saveAiRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        model: z.string().min(3).max(120),
        creditsPerMillionInput: z.number().min(0),
        creditsPerMillionOutput: z.number().min(0),
        source: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("ai_model_rates").upsert(
      {
        model: data.model,
        credits_per_1m_input: data.creditsPerMillionInput,
        credits_per_1m_output: data.creditsPerMillionOutput,
        source: data.source ?? "definido no admin",
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "model" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveCreditPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ eur: z.number().min(0) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("admin_cost_settings").upsert(
      {
        key: "credit_price_eur",
        value: data.eur || null,
        source: "definido no admin",
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMarginAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { negativeMarginUsers } = await import("@/lib/admin/ai-costs.server");
    return negativeMarginUsers(supabaseAdmin, 30);
  });
