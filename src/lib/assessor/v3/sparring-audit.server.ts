// Escrita do registo de auditoria do guard de treino. Nunca deixa a auditoria
// quebrar o turno: falhar a registar não pode falhar a conversa.

import {
  buildSparringSuppressionLog,
  type SparringSuppressionInput,
} from "./sparring-audit";

export async function logSparringSuppression(
  input: SparringSuppressionInput,
): Promise<void> {
  const row = buildSparringSuppressionLog(input);
  if (!row) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_audit_logs").insert(row as never);
  } catch {
    /* auditoria best-effort */
  }
}
