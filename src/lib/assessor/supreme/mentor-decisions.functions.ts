import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MentorDecisionKind } from "./mentor-decisions";

const KINDS: MentorDecisionKind[] = ["confirmar", "editar", "cancelar", "tratado"];

/** Guarda a decisão do consultor sobre uma sugestão do Mentor. */
export const saveMentorDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tipKey: string; decision: string; note?: string | null }) => {
    const tipKey = String(data?.tipKey ?? "").trim();
    const decision = String(data?.decision ?? "") as MentorDecisionKind;
    if (!tipKey) throw new Error("Falta o sinal da sugestão.");
    if (!KINDS.includes(decision)) throw new Error("Decisão inválida.");
    const note = typeof data?.note === "string" ? data.note.trim().slice(0, 400) : null;
    return { tipKey, decision, note: note || null };
  })
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("mentor_decisions").insert({
      user_id: context.userId,
      tip_key: data.tipKey,
      decision: data.decision,
      note: data.note,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Desfaz a decisão mais recente do consultor sobre uma sugestão do Mentor.
 *  Apaga a última linha do mesmo sinal, voltando o sinal a ser considerado.
 */
export const undoMentorDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tipKey: string }) => {
    const tipKey = String(data?.tipKey ?? "").trim();
    if (!tipKey) throw new Error("Falta o sinal da sugestão.");
    return { tipKey };
  })
  .handler(async ({ context, data }) => {
    const { data: row, error: findError } = await context.supabase
      .from("mentor_decisions")
      .select("id")
      .eq("user_id", context.userId)
      .eq("tip_key", data.tipKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findError) throw new Error(findError.message);
    if (!row) return { ok: false as const, reason: "Nenhuma decisão para desfazer." };
    const { error } = await context.supabase.from("mentor_decisions").delete().eq("id", row.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
