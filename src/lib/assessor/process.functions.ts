import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  content: z.string().min(1).max(4000),
});

// Envia uma mensagem do consultor a partir do chat web e executa o motor
// central do Assessor. A mensagem do utilizador e a resposta do Assessor
// são persistidas em assessor_messages (channel='web').
export const sendAssessorMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    // 1) Persistir a mensagem do consultor
    await supabaseAdmin.from("assessor_messages").insert({
      user_id: userId,
      role: "user",
      content: data.content,
      message_type: "web_text",
      status: "received",
      channel: "web",
    } as never);

    // 2) Chamar o motor central
    const { processAssessorMessage } = await import("./engine.server");
    const outcome = await processAssessorMessage({
      supabase: supabaseAdmin,
      userId,
      channel: "web",
      content: data.content,
      receivedAt: new Date(),
    });

    // 3) Persistir a resposta do Assessor se o motor ainda não o fez
    if (outcome.messageType !== "__ALREADY_PERSISTED__") {
      await supabaseAdmin.from("assessor_messages").insert({
        user_id: userId,
        role: "assessor",
        content: outcome.reply,
        message_type: outcome.messageType ?? null,
        structured_payload: (outcome.structuredPayload ?? null) as never,
        status: outcome.status ?? null,
        channel: "web",
      } as never);
    }

    return { ok: true, reply: outcome.reply };
  });