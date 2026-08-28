// Escrita do registo da anomalia de treino. Best-effort: nunca quebra o turno.

import { buildSparringLeakLog, detectSparringLeak } from "./sparring-assert";

/** Devolve true se o estado de treino escorregou até aqui (anomalia). */
export async function assertNoSparringLeak(input: {
  conversationState: unknown;
  userId: string;
  channel: string;
  message: string;
}): Promise<boolean> {
  const leak = detectSparringLeak(input.conversationState);
  if (!leak.anomaly) return false;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_audit_logs").insert(
      buildSparringLeakLog({
        userId: input.userId,
        channel: input.channel,
        message: input.message,
        topic: leak.topic,
      }) as never,
    );
  } catch {
    /* auditoria best-effort */
  }
  return true;
}
