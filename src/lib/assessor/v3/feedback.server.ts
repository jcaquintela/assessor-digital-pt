// Escrita do feedback do consultor. Só é chamada depois de confirmação explícita.

import type { FeedbackKind } from "./feedback";

export async function saveProductFeedback(
  supabase: any,
  input: { userId: string; kind: FeedbackKind; body: string; channel: string },
): Promise<boolean> {
  const body = String(input.body ?? "").trim().slice(0, 4000);
  if (!body) return false;
  const { error } = await supabase.from("product_feedback").insert({
    user_id: input.userId,
    kind: input.kind,
    body,
    channel: input.channel,
    status: "novo",
  } as never);
  return !error;
}
