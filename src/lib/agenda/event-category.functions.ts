// Backfill da categoria automática dos compromissos (Agenda Inteligente).
// Espelha `backfillSystemCategories` do Drive: lotes, só registos com
// `event_category is null`, nunca toca em categoria manual do consultor.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const backfillEventCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { eventCategoryFor } = await import("./event-category");
    const { data, error } = await supabase
      .from("follow_ups")
      .select(
        "id, title, type, person_id, related_property_id, related_prospecting_lead_id, opportunity_id, notes",
      )
      .eq("user_id", userId)
      .is("event_category", null)
      .limit(500);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Record<string, unknown>[];
    let updated = 0;
    for (const r of rows) {
      const cat = eventCategoryFor(r as never);
      const { error: upErr } = await (supabase.from("follow_ups") as never as {
        update: (v: unknown) => {
          eq: (a: string, b: unknown) => { eq: (a: string, b: unknown) => Promise<{ error: unknown }> };
        };
      })
        .update({ event_category: cat })
        .eq("id", r["id"])
        .eq("user_id", userId);
      if (!upErr) updated += 1;
    }
    return { updated, restantes: Math.max(0, rows.length - updated) };
  });
