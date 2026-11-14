// Regras do pacote de instalação v1.0.1 para o AFONSO Staging (só preparação).
// Nada aqui executa SQL nem liga a nenhuma base de dados.
//
// v1.0.1 já não reproduz o histórico de migrações (que tinha DML, DROP, RENAME e
// DROP NOT NULL). Parte do ESTADO FINAL do esquema V2, lido do `pg_dump
// --schema-only` do ensaio descartável autorizado (commit 84f428ce), e emite só
// instruções de criação. O ficheiro de origem e os 4 SQL da v1.0.0 ficam presos
// por sha256: se mudarem, a montagem falha.

export const V101_VERSION = "1.0.1";
export const STAGING_PROJECT_ID = "8d741542-70d9-4078-bfc6-64e3d047396a";

export const SOURCE_DUMP = {
  path: "staging-install/rehearsal/results/schema_public.sql",
  sha256: "e047c2e1fe0effb55a1208970befbb3d15a1e283baaaefc61793f9e1dc9e278c",
  commit: "84f428ce",
} as const;

/** Os 4 SQL da v1.0.0 (fonte da quarentena e do relatório de diferenças). */
export const V100_SQL = [
  { name: "S2-00_staging_roles_prelude.sql", sha256: "4e089b4712a431072512013c82fabebbdddff5a60d56fd97f55f437f1d20604e" },
  { name: "S2-01_v2_schema_part1.sql", sha256: "d9bf6c0e3adfd8add18f8fe8b9902921e1c0189ea6066690494625260cc5d291" },
  { name: "S2-02_v2_schema_part2.sql", sha256: "d553e0d4280519bb452157bc20cfc8c471b58f9d934dbbf98620ff901eac287b" },
  { name: "S2-99_staging_safety_checks.sql", sha256: "fdea9a5cd564ae5189047d5ea4b6472182129dbcdf4936672a838c00e41daba7" },
] as const;

/**
 * Objetos que JÁ existem no staging (migração 0000 do staging). A v1.0.1 não os
 * recria, não os substitui e não lhes muda políticas nem permissões.
 */
export const STAGING_OWNED = {
  types: ["app_role"],
  functions: ["has_role", "has_staging_access"],
  tables: ["staging_notes", "user_roles"],
} as const;

/** Únicas alterações (aditivas) a objetos do staging. */
export const APP_ROLE_VALUES_ADDED = ["consultant", "support_admin", "super_admin"] as const;
export const USER_ROLES_ADDED_COLUMN = { column: "created_by", type: "uuid" } as const;

/** Barreira admin/tester (função do próprio staging). */
export const GATE_POLICY_NAME = "staging_gate_admin_tester";
export const GATE_EXPR = "public.has_staging_access(auth.uid())";
export const CLIENT_ROLES = ["anon", "authenticated"] as const;
/** Só o servidor (service_role) recebe permissões diretas. */
export const SERVER_ROLE = "service_role";
export const SERVER_TABLE_PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;

/**
 * Tabelas V2 com acesso direto do cliente autenticado (atrás da barreira).
 * VAZIA por decisão: "acesso somente via funções server-side autorizadas".
 * Abrir uma tabela é uma decisão do proprietário e uma nova versão do pacote.
 */
export const CLIENT_TABLE_ALLOWLIST: readonly string[] = [];

/**
 * Chaves estrangeiras para auth.users permitidas (as restantes são retiradas).
 * user_roles é do staging e não é tocada; na V2 só profiles fica.
 */
export const AUTH_USERS_FK_ALLOWED_TABLES = ["profiles"] as const;

/**
 * Valores por omissão que ligariam envios/sincronizações em linhas novas.
 * No staging passam a false (divergência intencional e documentada da V1).
 */
export const SEND_DEFAULT_OVERRIDES = [
  { table: "access_waitlist", column: "notify", reason: "avisar quem está na lista de espera" },
  { table: "calendar_sync_state", column: "enabled", reason: "sincronização com calendário externo" },
  { table: "consultant_preferences", column: "morning_briefing_enabled", reason: "briefing matinal enviado pelo canal" },
  { table: "consultant_preferences", column: "evening_wrap_enabled", reason: "resumo da noite enviado pelo canal" },
  { table: "consultant_preferences", column: "evening_checkin_enabled", reason: "check-in da noite enviado pelo canal" },
  { table: "whatsapp_proactive_tests", column: "forced", reason: "teste proativo forçado por WhatsApp" },
] as const;

/** Partes do estado final que ficam em quarentena (plataforma/tempo real). */
export const QUARANTINED_FROM_DUMP = [
  { table: "assessor_messages", statement: "ALTER TABLE ONLY public.assessor_messages REPLICA IDENTITY FULL;", reason: "só serve à publicação Realtime, que fica em quarentena" },
] as const;

/** Nome dos ficheiros de migração da v1.0.1, por ordem de aplicação. */
export const V101_MIGRATIONS = [
  "S3-00_prelude_aditivo.sql",
  "S3-01_tipos_tabelas_a.sql",
  "S3-02_tabelas_b_restricoes.sql",
  "S3-03_funcoes.sql",
  "S3-04_indices_chaves_gatilhos.sql",
  "S3-05_politicas.sql",
] as const;
