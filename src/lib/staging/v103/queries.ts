// Consultas novas/alteradas da v1.0.3 (SÓ LEITURA, um único SELECT, falham com ERRO):
//  - P02 (R4): unaccent discriminado INSTALADA vs NOVA, com privilégios, assinatura e EXECUTE.
//    Continua a avaliar o DONO HISTÓRICO: o executor real do staging fica PENDENTE (B2).
//  - R30 (R1/R3): sessão do cliente na instância DESCARTÁVEL — data_directory, system identifier,
//    nonce, opções efetivas e a sua origem, ficheiros de configuração, pg_hba. Só ensaio.
// Todas as outras P/Q são as da v1.0.2, byte a byte.

import { SERVER_ROLE } from "../v101/rules";
import { verdictQuery, type Check, type QueryFile } from "../v102/queries";
import { REHEARSAL_PLACEHOLDERS as RP } from "./rules";

// Mesmas expressões da v1.0.2 (dono histórico = dono de public.user_roles).
const ownerOid = `(SELECT c.relowner FROM pg_class c WHERE c.oid = to_regclass('public.user_roles'))`;
const isSuper = `coalesce((SELECT rolsuper FROM pg_roles WHERE oid = ${ownerOid}), false)`;
const serverOid = `(SELECT oid FROM pg_roles WHERE rolname = '${SERVER_ROLE}')`;

export const P02_REPLACED_ID = "P02-07";
export const P02_NEW_IDS = ["P02-10", "P02-11", "P02-12", "P02-13", "P02-14", "P02-15"] as const;
export const UNACCENT_STATES = ["INSTALADA", "NOVA", "INSTALADA NOUTRO SCHEMA", "INDISPONÍVEL"] as const;

const P02_CTES = [
  `ux AS (SELECT e.oid, e.extversion::text AS versao, n.nspname::text AS esquema FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'unaccent')`,
  `ua AS (SELECT v.version::text AS versao, v.trusted, v.superuser FROM pg_available_extension_versions v JOIN pg_available_extensions a ON a.name = v.name AND a.default_version = v.version WHERE v.name = 'unaccent')`,
  `est AS (SELECT CASE WHEN (SELECT count(*) FROM ux) = 1 AND (SELECT esquema FROM ux) = 'extensions' THEN 'INSTALADA' WHEN (SELECT count(*) FROM ux) = 1 THEN 'INSTALADA NOUTRO SCHEMA' WHEN (SELECT count(*) FROM ua) = 1 THEN 'NOVA' ELSE 'INDISPONÍVEL' END AS estado)`,
  `uf AS (SELECT to_regprocedure('extensions.unaccent(regdictionary, text)') AS f2, to_regprocedure('extensions.unaccent(text)') AS f1)`,
];
const st = `(SELECT estado FROM est)`;
const f2 = `(SELECT f2 FROM uf)`;
const f1 = `(SELECT f1 FROM uf)`;
const dictExists = `EXISTS (SELECT 1 FROM pg_ts_dict t JOIN pg_namespace n ON n.oid = t.dictnamespace WHERE n.nspname = 'extensions' AND t.dictname = 'unaccent')`;
const extMembers = `(SELECT count(*) FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid IN (${f1}, ${f2}) AND d.refclassid = 'pg_extension'::regclass AND d.refobjid = (SELECT oid FROM ux) AND d.deptype = 'e')`;
const looseObjects = `(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'extensions' AND p.proname IN ('unaccent', 'unaccent_init', 'unaccent_lexize')) + (SELECT count(*) FROM pg_ts_dict t JOIN pg_namespace n ON n.oid = t.dictnamespace WHERE n.nspname = 'extensions' AND t.dictname = 'unaccent') + (SELECT count(*) FROM pg_ts_template t JOIN pg_namespace n ON n.oid = t.tmplnamespace WHERE n.nspname = 'extensions' AND t.tmplname = 'unaccent')`;
/** Privilégios por omissão GLOBAIS (os de schema só acrescentam) do dono histórico e do superutilizador de arranque (oid 10) que retirariam EXECUTE a PUBLIC e ao servidor. */
const badDefaultAcl = `EXISTS (SELECT 1 FROM pg_default_acl d WHERE d.defaclobjtype = 'f' AND d.defaclnamespace = 0 AND (d.defaclrole = ${ownerOid} OR d.defaclrole = 10::oid) AND NOT EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) e WHERE e.privilege_type = 'EXECUTE' AND (e.grantee = 0 OR e.grantee = ${serverOid})))`;

/** R4: checks de unaccent. Os que só se aplicam a um estado dizem-no no rótulo e dão "n.a." no outro; um estado fora de INSTALADA/NOVA falha em P02-07 e nos condicionais. */
export function unaccentChecksV103(): Check[] {
  return [
    { id: "P02-07", label: "unaccent: estado discriminado = INSTALADA (em extensions) ou NOVA (não instalada; versão por omissão disponível). INSTALADA NOUTRO SCHEMA ou INDISPONÍVEL => FALHA (o S4-00 usa IF NOT EXISTS e o S4-01 chama extensions.unaccent)", ok: `${st} IN ('INSTALADA', 'NOVA')`, expected: "INSTALADA ou NOVA", actual: `${st} || coalesce(' v' || (SELECT versao FROM ux) || ' em ' || (SELECT esquema FROM ux), '') || coalesce(' / disponível v' || (SELECT versao FROM ua) || ' trusted=' || (SELECT trusted::text FROM ua) || ' superuser=' || (SELECT superuser::text FROM ua), ' / sem versão disponível')` },
    { id: "P02-10", label: "só INSTALADA (n.a. se NOVA): assinaturas extensions.unaccent(regdictionary, text) e extensions.unaccent(text) devolvem text, pertencem à extensão, e o dicionário extensions.unaccent existe", ok: `${st} = 'NOVA' OR (${f2} IS NOT NULL AND ${f1} IS NOT NULL AND (SELECT bool_and(p.prorettype = 'text'::regtype) FROM pg_proc p WHERE p.oid IN (${f1}, ${f2})) AND ${extMembers} = 2 AND ${dictExists})`, expected: "sim (INSTALADA) · n.a. (NOVA)", actual: `CASE WHEN ${st} = 'NOVA' THEN 'n.a. (NOVA)' ELSE 'f(regdictionary,text)=' || coalesce(${f2}::text, 'em falta') || ' f(text)=' || coalesce(${f1}::text, 'em falta') || ' membros da extensão=' || ${extMembers}::text || ' dicionário=' || ${dictExists}::text END` },
    { id: "P02-11", label: `só INSTALADA (n.a. se NOVA): ${SERVER_ROLE} (colunas geradas via public.text_norm) e o dono histórico com EXECUTE em extensions.unaccent(regdictionary, text)`, ok: `${st} = 'NOVA' OR (has_function_privilege('${SERVER_ROLE}', ${f2}, 'EXECUTE') AND (${isSuper} OR has_function_privilege(${ownerOid}, ${f2}, 'EXECUTE')))`, expected: "sim (INSTALADA) · n.a. (NOVA)", actual: `CASE WHEN ${st} = 'NOVA' THEN 'n.a. (NOVA)' ELSE '${SERVER_ROLE}=' || coalesce(has_function_privilege('${SERVER_ROLE}', ${f2}, 'EXECUTE')::text, 'NULL') || ' dono=' || coalesce(has_function_privilege(${ownerOid}, ${f2}, 'EXECUTE')::text, 'NULL') END` },
    { id: "P02-12", label: "só NOVA (n.a. se INSTALADA): nenhum objeto solto unaccent/unaccent_init/unaccent_lexize, dicionário ou modelo unaccent em extensions (o CREATE EXTENSION colidiria)", ok: `${st} = 'INSTALADA' OR (${looseObjects}) = 0`, expected: "0 (NOVA) · n.a. (INSTALADA)", actual: `CASE WHEN ${st} = 'INSTALADA' THEN 'n.a. (INSTALADA)' ELSE (${looseObjects})::text END` },
    { id: "P02-13", label: "só NOVA (n.a. se INSTALADA): o dono histórico pode criar a extensão — superutilizador, OU versão por omissão trusted + CREATE na base atual + CREATE no schema extensions (exigência conservadora). Camadas da plataforma (ex.: lista de extensões permitidas) não são visíveis no catálogo", ok: `${st} = 'INSTALADA' OR ${isSuper} OR (coalesce((SELECT trusted FROM ua), false) AND has_database_privilege(${ownerOid}, current_database(), 'CREATE') AND has_schema_privilege(${ownerOid}, 'extensions', 'CREATE'))`, expected: "sim (NOVA) · n.a. (INSTALADA)", actual: `CASE WHEN ${st} = 'INSTALADA' THEN 'n.a. (INSTALADA)' ELSE 'super=' || ${isSuper}::text || ' trusted=' || coalesce((SELECT trusted::text FROM ua), 'n/d') || ' CREATE base=' || coalesce(has_database_privilege(${ownerOid}, current_database(), 'CREATE')::text, 'NULL') || ' CREATE extensions=' || coalesce(has_schema_privilege(${ownerOid}, 'extensions', 'CREATE')::text, 'NULL') END` },
    { id: "P02-14", label: `só NOVA (n.a. se INSTALADA): nenhum privilégio por omissão global (dono histórico ou superutilizador de arranque) retira EXECUTE a PUBLIC e a ${SERVER_ROLE} nas funções que a extensão vai criar`, ok: `${st} = 'INSTALADA' OR NOT ${badDefaultAcl}`, expected: "nenhum (NOVA) · n.a. (INSTALADA)", actual: `CASE WHEN ${st} = 'INSTALADA' THEN 'n.a. (INSTALADA)' WHEN ${badDefaultAcl} THEN 'há privilégios por omissão que retiram EXECUTE' ELSE 'nenhum' END` },
    { id: "P02-15", label: "dono histórico com USAGE em extensions (o S4-01 cria public.text_norm, que referencia extensions.unaccent)", ok: `${isSuper} OR has_schema_privilege(${ownerOid}, 'extensions', 'USAGE')`, expected: "sim", actual: `coalesce(has_schema_privilege(${ownerOid}, 'extensions', 'USAGE')::text, 'NULL')` },
  ];
}

export function buildP02V103(prev: QueryFile): QueryFile {
  if (prev.name !== "P02_privilegios_dono_historico.sql") throw new Error("P02 da v1.0.2 esperado");
  const kept = prev.checks.filter((c) => c.id !== P02_REPLACED_ID);
  if (kept.length !== prev.checks.length - 1) throw new Error(`P02 da v1.0.2 sem ${P02_REPLACED_ID}`);
  const checks = [...kept, ...unaccentChecksV103()].sort((a, b) => (a.id < b.id ? -1 : 1));
  const sql = verdictQuery("P02 · Privilégios do DONO HISTÓRICO (P01), lidos do catálogo — v1.0.3 com unaccent discriminado (R4). Não prova o executor efetivo.", [
    "Se o executor efetivo for outro papel, estes resultados não se aplicam a ele: a prova é externa (B2).",
    "unaccent (R4): P02-07 classifica o estado em INSTALADA (em extensions) ou NOVA (não instalada e",
    "disponível). P02-10/P02-11 só se aplicam a INSTALADA (assinatura e EXECUTE); P02-12/P02-13/P02-14 só a",
    "NOVA (sem objetos soltos; superutilizador, ou trusted + CREATE na base + CREATE em extensions; privilégios",
    "por omissão). O outro estado aparece como n.a. Qualquer outro estado => REPROVADO.",
    "LIMITE: listas de extensões permitidas e outras camadas da plataforma não aparecem no catálogo; o caminho",
    "real do executor do staging continua PENDENTE (B2, B16).",
  ], P02_CTES, checks, "APROVADO SÓ COMO DONO HISTÓRICO — o executor efetivo exige evidência independente (EXECUTOR-PRIVILEGES.md)");
  return { ...prev, checks, sql };
}

/** R30: verificação da sessão do CLIENTE na instância descartável. Corre como superutilizador do ensaio, ANTES do bootstrap. */
export function buildR30(): { name: string; checks: Check[]; sql: string } {
  const lit = (s: string) => `'${s}'`;
  const src = (n: string) => `(SELECT source FROM pg_settings WHERE name = '${n}')`;
  const checks: Check[] = [
    { id: "R30-00", label: "marcadores substituídos pelo R40 (caminhos absolutos, números, sha256)", ok: `${lit(RP.pgdata)} ~ '^/' AND ${lit(RP.sockdir)} ~ '^/' AND ${lit(RP.sysid)} ~ '^[0-9]+$' AND ${lit(RP.port)} ~ '^[0-9]+$' AND ${lit(RP.nonceSha)} ~ '^[0-9a-f]{64}$'`, expected: "todos", actual: "'ver cabeçalho do ficheiro'" },
    { id: "R30-01", label: "PostgreSQL 17", ok: "current_setting('server_version_num')::int BETWEEN 170000 AND 179999", expected: "17.x", actual: "current_setting('server_version')" },
    { id: "R30-02", label: "data_directory = PGDATA provado por R20", ok: `current_setting('data_directory') = ${lit(RP.pgdata)}`, expected: RP.pgdata, actual: "current_setting('data_directory')" },
    { id: "R30-03", label: "system identifier = o lido por pg_controldata no R10/R20", ok: `(SELECT system_identifier::text FROM pg_control_system()) = ${lit(RP.sysid)}`, expected: RP.sysid, actual: "(SELECT system_identifier::text FROM pg_control_system())" },
    { id: "R30-04", label: "o nonce dentro de PGDATA tem o mesmo sha256 que a cópia FORA de PGDATA", ok: `encode(sha256(pg_read_binary_file('afonso-rehearsal.nonce')), 'hex') = ${lit(RP.nonceSha)}`, expected: "= sha256 da cópia externa", actual: "left(encode(sha256(pg_read_binary_file('afonso-rehearsal.nonce')), 'hex'), 16)" },
    { id: "R30-05", label: "sem TCP: listen_addresses vazio, definido na linha de comando", ok: `current_setting('listen_addresses') = '' AND ${src("listen_addresses")} = 'command line'`, expected: "'' / command line", actual: `'''' || current_setting('listen_addresses') || ''' / ' || ${src("listen_addresses")}` },
    { id: "R30-06", label: "socket e porta = os do R10, definidos na linha de comando", ok: `current_setting('unix_socket_directories') = ${lit(RP.sockdir)} AND current_setting('port') = ${lit(RP.port)} AND ${src("unix_socket_directories")} = 'command line' AND ${src("port")} = 'command line'`, expected: `${RP.sockdir} / ${RP.port}`, actual: `current_setting('unix_socket_directories') || ' / ' || current_setting('port') || ' / ' || ${src("port")}` },
    { id: "R30-07", label: "esta sessão chegou pelo socket local (sem endereço de rede no servidor nem no cliente)", ok: "inet_server_addr() IS NULL AND inet_client_addr() IS NULL", expected: "NULL/NULL", actual: "coalesce(host(inet_server_addr()), 'NULL') || '/' || coalesce(host(inet_client_addr()), 'NULL')" },
    { id: "R30-08", label: "nenhuma biblioteca pré-carregada", ok: "current_setting('shared_preload_libraries') = '' AND current_setting('session_preload_libraries') = '' AND current_setting('local_preload_libraries') = ''", expected: "''", actual: "current_setting('shared_preload_libraries') || '|' || current_setting('session_preload_libraries') || '|' || current_setting('local_preload_libraries')" },
    { id: "R30-09", label: "sem replicação, arquivo nem restauro (nada sai da instância por WAL)", ok: "current_setting('wal_level') = 'minimal' AND current_setting('max_wal_senders') = '0' AND current_setting('archive_mode') = 'off' AND current_setting('archive_command') IN ('', '(disabled)') AND current_setting('archive_library') = '' AND current_setting('restore_command') = '' AND current_setting('primary_conninfo') = ''", expected: "minimal/0/off/vazio", actual: "current_setting('wal_level') || '/' || current_setting('max_wal_senders') || '/' || current_setting('archive_mode')" },
    { id: "R30-10", label: "ficheiros de configuração = os de PGDATA; nenhum include, nenhum erro, postgresql.auto.conf sem valores (sem ALTER SYSTEM)", ok: `current_setting('config_file') = ${lit(`${RP.pgdata}/postgresql.conf`)} AND current_setting('hba_file') = ${lit(`${RP.pgdata}/pg_hba.conf`)} AND current_setting('ident_file') = ${lit(`${RP.pgdata}/pg_ident.conf`)} AND NOT EXISTS (SELECT 1 FROM pg_file_settings WHERE error IS NOT NULL OR sourcefile IS DISTINCT FROM ${lit(`${RP.pgdata}/postgresql.conf`)})`, expected: "só postgresql.conf de PGDATA, sem erros", actual: "coalesce((SELECT string_agg(DISTINCT coalesce(sourcefile, 'NULL') || coalesce(' erro=' || error, ''), ',') FROM pg_file_settings), 'nenhuma definição em ficheiro')" },
    { id: "R30-11", label: "pg_hba: um só ficheiro, sem erros; só regras local, e host* apenas com reject", ok: "NOT EXISTS (SELECT 1 FROM pg_hba_file_rules WHERE error IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM pg_hba_file_rules WHERE type <> 'local' AND auth_method <> 'reject') AND (SELECT count(DISTINCT file_name) FROM pg_hba_file_rules) = 1 AND NOT EXISTS (SELECT 1 FROM pg_ident_file_mappings)", expected: "sim", actual: "(SELECT string_agg(type || ':' || coalesce(auth_method, '?'), ',' ORDER BY rule_number) FROM pg_hba_file_rules)" },
    { id: "R30-12", label: "nenhuma definição vinda de variáveis de ambiente nem por base/papel (ainda antes do bootstrap)", ok: "NOT EXISTS (SELECT 1 FROM pg_settings WHERE source = 'environment variable') AND NOT EXISTS (SELECT 1 FROM pg_db_role_setting)", expected: "nenhuma", actual: "coalesce((SELECT string_agg(name, ',') FROM pg_settings WHERE source = 'environment variable'), '-') || ' / ' || (SELECT count(*) FROM pg_db_role_setting)::text" },
    { id: "R30-13", label: "sem SSL, caminho de bibliotecas por omissão", ok: "current_setting('ssl') = 'off' AND current_setting('dynamic_library_path') = '$libdir'", expected: "off / $libdir", actual: "current_setting('ssl') || ' / ' || current_setting('dynamic_library_path')" },
    { id: "R30-14", label: "nada ligado para fora: só plpgsql instalada; sem servidores externos, subscrições nem slots", ok: "(SELECT array_agg(extname::text ORDER BY extname) FROM pg_extension) = ARRAY['plpgsql'] AND NOT EXISTS (SELECT 1 FROM pg_foreign_server) AND NOT EXISTS (SELECT 1 FROM pg_user_mappings) AND NOT EXISTS (SELECT 1 FROM pg_subscription) AND NOT EXISTS (SELECT 1 FROM pg_replication_slots)", expected: "plpgsql / 0 / 0 / 0", actual: "(SELECT string_agg(extname::text, ',') FROM pg_extension) || ' / ' || (SELECT count(*) FROM pg_foreign_server)::text || ' / ' || (SELECT count(*) FROM pg_subscription)::text" },
    { id: "R30-15", label: "bases = só as do initdb (e afonso_ensaio, se o bootstrap já correu)", ok: "(SELECT array_agg(datname::text ORDER BY datname) FROM pg_database WHERE datname NOT IN ('afonso_ensaio')) = ARRAY['postgres', 'template0', 'template1']", expected: "postgres,template0,template1", actual: "(SELECT string_agg(datname::text, ',' ORDER BY datname) FROM pg_database)" },
    { id: "R30-16", label: "sessão do superutilizador do ensaio (ensaio_super) na base postgres; PID do processo servidor desta sessão", ok: "current_user = 'ensaio_super' AND (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AND current_database() = 'postgres' AND pg_backend_pid() > 0", expected: "ensaio_super / postgres / PID", actual: "current_user::text || ' / ' || current_database()::text || ' / pid ' || pg_backend_pid()::text" },
  ];
  const sql = verdictQuery("R30 · Sessão do CLIENTE ligada à instância DESCARTÁVEL provada por R20 (só ensaio; NUNCA no staging nem na V1).", [
    "Corre APENAS através de tools/R40_ligar_cliente.sh, que substitui os marcadores __R_…__ e liga esta sessão ao",
    "processo (R41: o processo servidor desta sessão é filho do postmaster provado por R20). Como superutilizador",
    "do ensaio, ANTES do bootstrap. Lê o nonce em PGDATA (pg_read_binary_file, só leitura).",
    "LIMITE: prova o que a instância e o processo mostram; não prova o anfitrião (precondições E1–E9, REHEARSAL-TARGET.md).",
  ], [], checks, "R30 APROVADO");
  return { name: "R30_sessao_alvo.sql", checks, sql };
}
