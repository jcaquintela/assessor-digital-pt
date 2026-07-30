import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type PublishedPlan = { tier: string; price_month: number | null; notes: string | null };

// Leitura pública (landing de planos). Só planos publicados, colunas seguras.
export const listPublishedPlans = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ plans: PublishedPlan[] }> => {
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await supabase
      .from("plan_configs")
      .select("tier, price_month, notes")
      .eq("status", "published");
    if (error) throw new Error(error.message);
    return { plans: (data ?? []) as PublishedPlan[] };
  },
);