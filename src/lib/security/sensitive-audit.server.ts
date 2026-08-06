// Registo de LEITURAS a tabelas sensíveis.
//
// As escrituras (criar/alterar/apagar) já são registadas automaticamente por
// triggers na base de dados (`audit_sensitive_write`). O Postgres não permite
// triggers em leituras, por isso as leituras de segredos são registadas aqui,
// no ponto onde acontecem.
//
// Nunca registar valores secretos — apenas quem leu, o quê e com que resultado.

export type SensitiveTable =
  | "app_user_connections"
  | "calendar_connections"
  | "dashboard_login_tokens"
  | "telegram_link_tokens"
  | "whatsapp_link_codes"
  | "support_sessions";

export async function auditSensitiveRead(input: {
  table: SensitiveTable;
  purpose: string;
  targetUserId?: string | null;
  actorUserId?: string | null;
  outcome?: "ok" | "vazio" | "invalido" | "erro";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: input.actorUserId ?? null,
      action: `sensivel.${input.table}.leitura`,
      target_user_id: input.targetUserId ?? null,
      resource_type: input.table,
      resource_id: null,
      reason: input.purpose,
      metadata: {
        source: "app:auditSensitiveRead",
        outcome: input.outcome ?? "ok",
        ...(input.metadata ?? {}),
      },
    } as never);
  } catch (err) {
    // A auditoria nunca pode partir o fluxo do consultor.
    console.error("[sensitive-audit] falha a registar leitura:", (err as Error)?.message);
  }
}
