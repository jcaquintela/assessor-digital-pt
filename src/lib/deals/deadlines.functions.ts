// Prazos de negócio — leitura/escrita a partir do dashboard.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listDealDeadlines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { opportunityId: string }) => data)
  .handler(async ({ data, context }) => {
    const { listDeadlines } = await import("./deadlines.server");
    return listDeadlines(context.supabase, context.userId, {
      opportunityId: data.opportunityId,
      includeClosed: true,
    });
  });

export const addDealDeadline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    opportunityId: string;
    label: string;
    dueDate: string;
    noticeDays?: number | null;
    notes?: string | null;
  }) => data)
  .handler(async ({ data, context }) => {
    if (!data.opportunityId || !data.dueDate) throw new Error("Falta o negócio ou a data.");
    const { addDeadline } = await import("./deadlines.server");
    return addDeadline(context.supabase, context.userId, {
      opportunityId: data.opportunityId,
      label: data.label,
      dueDate: data.dueDate,
      noticeDays: data.noticeDays ?? null,
      notes: data.notes ?? null,
    });
  });

export const setDealDeadlineStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; status: "aberto" | "cumprido" | "cancelado" }) => data)
  .handler(async ({ data, context }) => {
    const { setDeadlineStatus } = await import("./deadlines.server");
    await setDeadlineStatus(context.supabase, context.userId, data.id, data.status);
    return { ok: true };
  });
