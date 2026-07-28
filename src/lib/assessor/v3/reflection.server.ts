// Reflection Engine — análise interna após turnos fracos.
// Dispara quando AQS<0.80, ATS<85, ou existe uma correção do consultor.
// Nunca é mostrada ao consultor.

import { callGateway, V2_MODEL_DEFAULT } from "../v2/gateway.server";
import { REFLECTION_SYSTEM_PROMPT } from "./prompts";

export type ReflectionTrigger = "low_aqs" | "low_ats" | "user_correction";

export interface ReflectionInput {
  trigger: ReflectionTrigger;
  message: string;
  assistantReply: string;
  decisionAction: string;
  observations: unknown;
  searches: unknown;
  aqs: number | null;
  ats: number | null;
  correctionCategory?: string | null;
  correctionMessage?: string | null;
}

export async function reflect(
  supabase: any,
  input: ReflectionInput & { userId: string; traceId: string | null; correctionId?: string | null },
): Promise<void> {
  try {
    const call = await callGateway({
      model: V2_MODEL_DEFAULT,
      messages: [
        { role: "system", content: REFLECTION_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify({
          trigger: input.trigger,
          message: input.message,
          assistant_reply: input.assistantReply,
          decision_action: input.decisionAction,
          observations: input.observations,
          searches: input.searches,
          aqs: input.aqs,
          ats: input.ats,
          correction_category: input.correctionCategory ?? null,
          correction_message: input.correctionMessage ?? null,
        }) },
      ],
      temperature: 0.2,
      maxTokens: 400,
      responseFormat: { type: "json_object" },
    });
    const raw = call.message?.content ?? "{}";
    let analysis: any = {};
    try { analysis = JSON.parse((raw.match(/\{[\s\S]*\}/) ?? [raw])[0]); } catch { analysis = { raw }; }

    await supabase.from("assistant_reflections").insert({
      user_id: input.userId,
      trace_id: input.traceId,
      correction_id: input.correctionId ?? null,
      trigger: input.trigger,
      analysis,
      model: V2_MODEL_DEFAULT,
    } as never);
  } catch { /* noop — reflexão é best-effort */ }
}