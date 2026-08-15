import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mentorFollowUpSuggestion, mentorFollowUpDueDate } from "./mentor-followup";

/** Cria um seguimento já preenchido a partir da sugestão do Mentor. */
export const createMentorFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tipKey: string }) => {
    const tipKey = String(data?.tipKey ?? "").trim();
    if (!tipKey) throw new Error("Falta o sinal da sugestão.");
    return { tipKey };
  })
  .handler(async ({ context, data }) => {
    const s = mentorFollowUpSuggestion(data.tipKey);
    if (!s) throw new Error("Esta sugestão não tem um seguimento associado.");
    const dueDate = mentorFollowUpDueDate(s.dueInDays);
    const { data: row, error } = await context.supabase
      .from("follow_ups")
      .insert({
        user_id: context.userId,
        title: s.title,
        type: s.type,
        notes: s.notes,
        due_date: new Date(`${dueDate}T09:00:00`).toISOString(),
        status: "pendente",
        priority: "media",
        source_channel: "dashboard",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true as const, id: row?.id as string | undefined, dueDate, title: s.title };
  });
