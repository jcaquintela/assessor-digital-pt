// Regras do pacote de instalação v1.0.2 (CORRETIVA) para o AFONSO Staging (só preparação).
// Nada aqui executa SQL nem liga a nenhuma base de dados.
//
// A v1.0.2 parte das MESMAS fontes da v1.0.1 (estado final presas por sha256) e do mesmo
// montador, com um perfil que corrige os achados da auditoria independente da v1.0.1:
//  A) funções que escrevem/descobrem tabelas do staging (incl. user_roles) vão para a quarentena;
//  D) service_role perde TUDO antes de receber só SELECT/INSERT/UPDATE/DELETE (tabelas) e EXECUTE (funções);
//  E) verificações de base sem tautologias (sha256 com cobertura exigida, registo separado).

import type { BuildProfile } from "../v101/build";

export const V102_VERSION = "1.0.2";
export const V102_PREVIOUS = { version: "1.0.1", commit: "a444f846" } as const;

export const V102_MIGRATIONS = [
  "S4-00_prelude_aditivo.sql",
  "S4-01_tipos_tabelas_a.sql",
  "S4-02_tabelas_b_restricoes.sql",
  "S4-03_funcoes.sql",
  "S4-04_indices_chaves_gatilhos.sql",
  "S4-05_politicas.sql",
] as const;

/**
 * Funções do estado final que NÃO são instaladas (preferência do proprietário: quarentena em
 * vez de allowlist). Reativar exige autorização separada e uma nova versão.
 */
export const V102_QUARANTINED_FUNCTIONS = [
  {
    name: "merge_accounts_apply",
    reason: "descobre TODAS as tabelas de public com user_id (incluindo user_roles e qualquer tabela futura) e move/APAGA linhas — podia transferir ou apagar o papel admin do staging",
  },
  {
    name: "merge_accounts_preview",
    reason: "par de leitura de merge_accounts_apply; também descobre tabelas no catálogo (incluindo user_roles); sem a fusão não tem uso",
  },
  {
    name: "handle_new_user",
    reason: "escreve em user_roles (papel consultant) e cria perfil/categorias; só servia ao gatilho em auth.users, que já está em quarentena (QZ-02)",
  },
] as const;

export const V102_PROFILE: BuildProfile = {
  version: V102_VERSION,
  generator: "scripts/staging/build-staging-package-v102.ts",
  migrations: V102_MIGRATIONS,
  quarantinedFunctions: V102_QUARANTINED_FUNCTIONS,
  revokeFromServer: true,
};

/** Privilégios exatos que service_role pode ter no fim (a auditoria de ACL do Q02 usa estes). */
export const SERVER_TABLE_PRIVS_EXACT = ["DELETE", "INSERT", "SELECT", "UPDATE"] as const;
export const SERVER_FUNCTION_PRIVS_EXACT = ["EXECUTE"] as const;
