// Consultas novas/alteradas da v1.0.4 (SÓ LEITURA, um único SELECT, falham com ERRO):
//  - P02 (P1, P2): dicionário unaccent (dono, modelo, opções, pertença à extensão) e privilégios por omissão
//    sem pressupor o OID 10 (o superutilizador de arranque é lido do catálogo). Continua "só dono histórico".
//  - R30 (V1): igual à v1.0.3 nas verificações; o cabeçalho deixa de conter texto parecido com um marcador.
//  - R31 (S1): identidade de QUALQUER sessão (base, papel, sem SET ROLE, socket local, porta, arranque do
//    postmaster, nenhuma outra sessão de cliente). Corre antes E depois do ficheiro de cada passo.
//  - R32 (S1): só em sessões do superutilizador do ensaio: PGDATA, system identifier, nonce, socket.
// Todas as outras P/Q são as da v1.0.2/v1.0.3, byte a byte. O veredito usa o mesmo verdictQuery: a conversão
// para int só acontece num ramo que depende de colunas (v.falhas / v.n), nunca numa constante.

import { SERVER_ROLE } from "../v101/rules";
import { verdictQuery, type Check, type QueryFile } from "../v102/queries";
import { buildR30 } from "../v103/queries";

const ownerOid = `(SELECT c.relowner FROM pg_class c WHERE c.oid = to_regclass('public.user_roles'))`;
const serverOid = `(SELECT oid FROM pg_roles WHERE rolname = '${SERVER_ROLE}')`;
/** P2: o superutilizador de arranque é o dono de pg_catalog (lido, não suposto). */
export const BOOTSTRAP_SUPER = `(SELECT n.nspowner FROM pg_namespace n WHERE n.nspname = 'pg_catalog')`;
const st = `(SELECT estado FROM est)`;

/** P2: privilégios por omissão GLOBAIS dos papéis que podem ficar donos das funções da extensão. */
const badDefaultAcl = `EXISTS (SELECT 1 FROM pg_default_acl d WHERE d.defaclobjtype = 'f' AND d.defaclnamespace = 0 AND d.defaclrole IN (${ownerOid}, ${BOOTSTRAP_SUPER}) AND NOT EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) e WHERE e.privilege_type = 'EXECUTE' AND (e.grantee = 0 OR e.grantee = ${serverOid})))`;

/** P1: o dicionário extensions.unaccent tal como o script da extensão o cria. */
const dict = `(SELECT t.oid FROM pg_ts_dict t JOIN pg_namespace n ON n.oid = t.dictnamespace WHERE n.nspname = 'extensions' AND t.dictname = 'unaccent')`;
const tmpl = `(SELECT t.oid FROM pg_ts_template t JOIN pg_namespace n ON n.oid = t.tmplnamespace WHERE n.nspname = 'extensions' AND t.tmplname = 'unaccent')`;
const extOid = `(SELECT oid FROM ux)`;
const member = (classid: string, objid: string) => `EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = '${classid}'::regclass AND d.objid = ${objid} AND d.refclassid = 'pg_extension'::regclass AND d.refobjid = ${extOid} AND d.deptype = 'e')`;
const procIn = (oidExpr: string, name: string) => `EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.oid = ${oidExpr} AND n.nspname = 'extensions' AND p.proname = '${name}')`;
const dictOwner = `(SELECT dictowner FROM pg_ts_dict WHERE oid = ${dict})`;
const f2Owner = `(SELECT proowner FROM pg_proc WHERE oid = to_regprocedure('extensions.unaccent(regdictionary, text)'))`;
const dictOpt = `(SELECT dictinitoption FROM pg_ts_dict WHERE oid = ${dict})`;
const normOpt = `lower(regexp_replace(coalesce(${dictOpt}, ''), '\\s', '', 'g'))`;

export function unaccentChecksV104(): Check[] {
  return [
    { id: "P02-14", label: `só NOVA (n.a. se INSTALADA): nenhum privilégio por omissão global do dono histórico NEM do superutilizador de arranque (lido como dono de pg_catalog, sem supor o OID 10) retira EXECUTE a PUBLIC e a ${SERVER_ROLE} nas funções que a extensão vai criar`, ok: `${st} = 'INSTALADA' OR (${BOOTSTRAP_SUPER} IS NOT NULL AND NOT ${badDefaultAcl})`, expected: "nenhum (NOVA) · n.a. (INSTALADA)", actual: `CASE WHEN ${st} = 'INSTALADA' THEN 'n.a. (INSTALADA)' WHEN ${BOOTSTRAP_SUPER} IS NULL THEN 'superutilizador de arranque não identificado' WHEN ${badDefaultAcl} THEN 'há privilégios por omissão que retiram EXECUTE' ELSE 'nenhum (arranque=' || pg_get_userbyid(${BOOTSTRAP_SUPER}) || ')' END` },
    { id: "P02-16", label: "só INSTALADA (n.a. se NOVA): o dicionário extensions.unaccent pertence à extensão, usa o modelo extensions.unaccent (init/lexize de extensions, também da extensão), tem as opções do script da extensão (RULES = 'unaccent') e o mesmo dono que extensions.unaccent(regdictionary, text), que é o dono da extensão ou o superutilizador de arranque", ok: `${st} = 'NOVA' OR (${dict} IS NOT NULL AND ${tmpl} IS NOT NULL AND ${member("pg_ts_dict", dict)} AND ${member("pg_ts_template", tmpl)} AND (SELECT dicttemplate FROM pg_ts_dict WHERE oid = ${dict}) = ${tmpl} AND ${procIn(`(SELECT tmplinit FROM pg_ts_template WHERE oid = ${tmpl})`, "unaccent_init")} AND ${procIn(`(SELECT tmpllexize FROM pg_ts_template WHERE oid = ${tmpl})`, "unaccent_lexize")} AND ${normOpt} = 'rules=''unaccent''' AND ${dictOwner} = ${f2Owner} AND ${dictOwner} IN ((SELECT extowner FROM pg_extension WHERE oid = ${extOid}), ${BOOTSTRAP_SUPER}))`, expected: "sim (INSTALADA) · n.a. (NOVA)", actual: `CASE WHEN ${st} = 'NOVA' THEN 'n.a. (NOVA)' ELSE 'dicionário=' || coalesce(${dict}::text, 'em falta') || ' modelo=' || coalesce(${tmpl}::text, 'em falta') || ' membro=' || coalesce(${member("pg_ts_dict", dict)}::text, 'NULL') || '/' || coalesce(${member("pg_ts_template", tmpl)}::text, 'NULL') || ' opções=' || coalesce(${dictOpt}, 'NULL') || ' dono=' || coalesce(pg_get_userbyid(${dictOwner}), 'NULL') || ' dono f()=' || coalesce(pg_get_userbyid(${f2Owner}), 'NULL') END` },
  ];
}

export const P02_V104_REPLACED = ["P02-14"] as const;
export const P02_V104_NEW = ["P02-16"] as const;

export function buildP02V104(prev: QueryFile): QueryFile {
  if (prev.name !== "P02_privilegios_dono_historico.sql") throw new Error("P02 da v1.0.3 esperado");
  const kept = prev.checks.filter((c) => !(P02_V104_REPLACED as readonly string[]).includes(c.id));
  if (kept.length !== prev.checks.length - P02_V104_REPLACED.length) throw new Error("P02 da v1.0.3 sem P02-14");
  if (prev.checks.some((c) => /\b10::oid\b/.test(c.ok) && c.id !== "P02-14")) throw new Error("OID 10 fora do P02-14");
  const checks = [...kept, ...unaccentChecksV104()].sort((a, b) => (a.id < b.id ? -1 : 1));
  const sql = verdictQuery("P02 · Privilégios do DONO HISTÓRICO (P01), lidos do catálogo — v1.0.4 (unaccent INSTALADA/NOVA, dicionário, sem OID fixo). Não prova o executor efetivo.", [
    "Se o executor efetivo for outro papel, estes resultados não se aplicam a ele: a prova é externa (B2).",
    "unaccent: P02-07 classifica INSTALADA (em extensions) ou NOVA (não instalada e disponível). INSTALADA:",
    "P02-10/11 (assinaturas, pertença, EXECUTE) e P02-16 (dicionário: pertença, modelo, opções, dono). NOVA:",
    "P02-12/13/14 (sem objetos soltos; superutilizador ou trusted + CREATE; privilégios por omissão do dono",
    "histórico e do superutilizador de arranque, lido como dono de pg_catalog). O outro estado dá n.a.",
    "LIMITE: listas de extensões permitidas e outras camadas da plataforma não aparecem no catálogo; o caminho",
    "real do executor do staging continua PENDENTE (B2, B16).",
  ], [
    `ux AS (SELECT e.oid, e.extversion::text AS versao, n.nspname::text AS esquema FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'unaccent')`,
    `ua AS (SELECT v.version::text AS versao, v.trusted, v.superuser FROM pg_available_extension_versions v JOIN pg_available_extensions a ON a.name = v.name AND a.default_version = v.version WHERE v.name = 'unaccent')`,
    `est AS (SELECT CASE WHEN (SELECT count(*) FROM ux) = 1 AND (SELECT esquema FROM ux) = 'extensions' THEN 'INSTALADA' WHEN (SELECT count(*) FROM ux) = 1 THEN 'INSTALADA NOUTRO SCHEMA' WHEN (SELECT count(*) FROM ua) = 1 THEN 'NOVA' ELSE 'INDISPONÍVEL' END AS estado)`,
    `uf AS (SELECT to_regprocedure('extensions.unaccent(regdictionary, text)') AS f2, to_regprocedure('extensions.unaccent(text)') AS f1)`,
  ], checks, "APROVADO SÓ COMO DONO HISTÓRICO — o executor efetivo exige evidência independente (EXECUTOR-PRIVILEGES.md)");
  return { ...prev, checks, sql };
}

const lit = (s: string) => `'${s}'`;

/** V1: R30 com as mesmas 17 verificações da v1.0.3; o cabeçalho já não contém nada parecido com um marcador. */
export function buildR30V104(): { name: string; checks: Check[]; sql: string } {
  const prev = buildR30();
  const sql = verdictQuery("R30 · Sessão do CLIENTE ligada à instância DESCARTÁVEL provada por R20 (só ensaio; NUNCA no staging nem na V1).", [
    "Corre APENAS como passo R30 do wrapper único tools/R40_sessao.sh, que substitui os marcadores numa CÓPIA",
    "determinística e prova (R41, fora do SQL) que o processo servidor desta sessão é filho do postmaster provado",
    "por R20. Como superutilizador do ensaio, ANTES do bootstrap. Lê o nonce em PGDATA (pg_read_binary_file).",
    "LIMITE: prova o que a instância e o processo mostram; não prova o anfitrião (obrigações E1–E10, REHEARSAL-TARGET.md).",
  ], [], prev.checks, "R30 APROVADO");
  return { name: prev.name, checks: prev.checks, sql };
}

/** S1: identidade de qualquer sessão de passo (qualquer papel; nada aqui exige superutilizador). */
export function buildR31(): { name: string; checks: Check[]; sql: string } {
  const checks: Check[] = [
    { id: "R31-01", label: "PostgreSQL 17 e não em recuperação", ok: "current_setting('server_version_num')::int BETWEEN 170000 AND 179999 AND NOT pg_is_in_recovery()", expected: "17.x / primário", actual: "current_setting('server_version') || ' / recuperação=' || pg_is_in_recovery()::text" },
    { id: "R31-02", label: "base da sessão = a do passo", ok: "current_database() = '__R_DB__'", expected: "__R_DB__", actual: "current_database()::text" },
    { id: "R31-03", label: "papel da sessão = o do passo, sem SET ROLE nem SET SESSION AUTHORIZATION ativos", ok: "session_user = '__R_ROLE__' AND current_user = session_user", expected: "__R_ROLE__ / __R_ROLE__", actual: "session_user::text || ' / ' || current_user::text" },
    { id: "R31-04", label: "atributo de superutilizador do papel = o esperado no passo (sim só para ensaio_super)", ok: "coalesce((SELECT rolsuper FROM pg_roles WHERE rolname = session_user), false) = ('__R_SUPER__' = 'sim')", expected: "__R_SUPER__", actual: "coalesce((SELECT rolsuper::text FROM pg_roles WHERE rolname = session_user), 'papel inexistente')" },
    { id: "R31-05", label: "sessão pelo socket local: sem endereço de rede no servidor nem no cliente", ok: "inet_server_addr() IS NULL AND inet_client_addr() IS NULL", expected: "NULL/NULL", actual: "coalesce(host(inet_server_addr()), 'NULL') || '/' || coalesce(host(inet_client_addr()), 'NULL')" },
    { id: "R31-06", label: "porta = a do R10", ok: "current_setting('port') = '__R_PORT__'", expected: "__R_PORT__", actual: "current_setting('port')" },
    { id: "R31-07", label: "arranque do postmaster coincide (±2 s) com a linha 3 do postmaster.pid lida pelo R20 (corrobora; a identidade é provada fora do SQL pelo R41)", ok: "abs(extract(epoch FROM pg_postmaster_start_time()) - '__R_PGSTART__'::numeric) <= 2", expected: "|Δ| ≤ 2 s", actual: "(extract(epoch FROM pg_postmaster_start_time())::bigint)::text" },
    { id: "R31-08", label: "nenhuma outra sessão de cliente ligada à instância durante o passo", ok: "NOT EXISTS (SELECT 1 FROM pg_stat_activity WHERE backend_type = 'client backend' AND pid <> pg_backend_pid())", expected: "0", actual: "(SELECT count(*) FROM pg_stat_activity WHERE backend_type = 'client backend' AND pid <> pg_backend_pid())::text" },
  ];
  const sql = verdictQuery("R31 · Identidade da SESSÃO de um passo do ensaio DESCARTÁVEL (antes E depois do ficheiro; só ensaio).", [
    "Corre APENAS dentro do wrapper único tools/R40_sessao.sh, numa CÓPIA com os marcadores substituídos.",
    "Não exige superutilizador. A identidade do processo servidor é provada fora do SQL (R41); isto confirma",
    "base, papel, socket, porta e exclusividade vistos de dentro. LIMITE: não prova o anfitrião (E1–E10).",
  ], [], checks, "R31 APROVADO");
  return { name: "R31_sessao_passo.sql", checks, sql };
}

/** S1: só em sessões do superutilizador do ensaio (R30, B*, T01): a instância é a do R10. */
export function buildR32(): { name: string; checks: Check[]; sql: string } {
  const checks: Check[] = [
    { id: "R32-01", label: "data_directory = PGDATA provado por R20", ok: `current_setting('data_directory') = ${lit("__R_PGDATA__")}`, expected: "__R_PGDATA__", actual: "current_setting('data_directory')" },
    { id: "R32-02", label: "system identifier = o registado pelo R10", ok: `(SELECT system_identifier::text FROM pg_control_system()) = ${lit("__R_SYSID__")}`, expected: "__R_SYSID__", actual: "(SELECT system_identifier::text FROM pg_control_system())" },
    { id: "R32-03", label: "nonce em PGDATA com o sha256 da cópia FORA de PGDATA", ok: `encode(sha256(pg_read_binary_file('afonso-rehearsal.nonce')), 'hex') = ${lit("__R_NONCE_SHA256__")}`, expected: "= sha256 da cópia externa", actual: "left(encode(sha256(pg_read_binary_file('afonso-rehearsal.nonce')), 'hex'), 16)" },
    { id: "R32-04", label: "pasta do socket = a do R10 e sem TCP", ok: `current_setting('unix_socket_directories') = ${lit("__R_SOCKDIR__")} AND current_setting('listen_addresses') = ''`, expected: "__R_SOCKDIR__ / ''", actual: "current_setting('unix_socket_directories') || ' / ''' || current_setting('listen_addresses') || ''''" },
  ];
  const sql = verdictQuery("R32 · Instância da sessão do SUPERUTILIZADOR do ensaio (passos R30, B*, T01; só ensaio).", [
    "Corre APENAS dentro do wrapper único tools/R40_sessao.sh, numa CÓPIA com os marcadores substituídos.",
    "Exige o superutilizador do ensaio (lê data_directory, pg_control_system e o nonce). Sessões do papel",
    "postgres não o correm: para elas a instância é provada pelo R41 (processo filho do postmaster do R20).",
  ], [], checks, "R32 APROVADO");
  return { name: "R32_instancia_super.sql", checks, sql };
}
