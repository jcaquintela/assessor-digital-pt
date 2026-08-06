import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({ email: z.string().trim().min(3).max(320) });

// Público por natureza (quem se esqueceu da palavra-passe não tem sessão).
// Devolve sempre ok; `sendEmail` diz apenas ao browser se deve pedir o email
// de recuperação — nunca revela se a conta existe.
export const requestPasswordRecovery = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    try {
      const { sendPasswordRecovery } = await import("./password-recovery.server");
      const r = await sendPasswordRecovery(data.email);
      return { ok: true as const, sendEmail: !r.sentViaChannel };
    } catch (e) {
      console.error("[password-recovery]", e);
      return { ok: true as const, sendEmail: true };
    }
  });