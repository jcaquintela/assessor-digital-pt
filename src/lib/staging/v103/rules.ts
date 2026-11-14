// Regras do pacote v1.0.3 para o AFONSO Staging (só preparação; nada aqui liga a uma base).
//
// A auditoria independente FINAL da v1.0.2 não demonstrou defeito nas seis migrações e deu NO-GO
// apenas ao PROCEDIMENTO DE ENSAIO. Por isso a v1.0.3:
//  - copia S4-00…S4-05 BYTE A BYTE da v1.0.2 (hashes presos abaixo), com os REVOKE/só-servidor;
//  - não altera pg_get_userbyid(oid) (F1: falso positivo, por instrução do proprietário);
//  - corrige só o procedimento: R1 arranque controlado e prova do processo, R2 isolamento de rede
//    de entrada e saída, R3 configuração completa e ambiente controlado, R4 preflight de unaccent
//    (INSTALADA vs NOVA), R5 bootstrap 100% sintético. Nenhuma execução está autorizada.

export const V103_VERSION = "1.0.3";
export const V103_PREVIOUS = { version: "1.0.2", commit: "09f7e48b" } as const;
export const V103_PREVIOUS_DIR = "staging-install/package/v1.0.2";

/** sha256 das 6 migrações tal como auditadas na v1.0.2 (MANIFEST da v1.0.2). A montagem falha se mudarem. */
export const V103_PRESERVED_SQL_SHA256: Readonly<Record<string, string>> = {
  "S4-00_prelude_aditivo.sql": "23f198ffa3135153efb015008e10368829c78ac2548a6a0056efa4738d2f828c",
  "S4-01_tipos_tabelas_a.sql": "5724b20543f0716e3c818e186e8a56cb5fc66790f671796a1e2e2968787aaf55",
  "S4-02_tabelas_b_restricoes.sql": "5b8fae75417e16e25cb21d80f7ba47ea8aab11237f9c3dc95020bd922c778cc4",
  "S4-03_funcoes.sql": "68f244fffb97280eaedda9054784ccc0952936e9405838968e0a5cfe6fe4846a",
  "S4-04_indices_chaves_gatilhos.sql": "8ba1230d83e7c8794ec9d2b8200ac1ef79739f2cd9f96439ee8fb266d4dba2ba",
  "S4-05_politicas.sql": "6276b63eb5bd6c1c54c41dbc535e2dd62f18f83d910037d7e48cc25a30fa8543",
};

/** Documentos escritos à mão na v1.0.2 que a v1.0.3 copia sem alteração (o conteúdo continua válido: S4 e Q iguais). */
export const V103_COPIED_HANDWRITTEN = ["COLLISIONS.md", "OWNER-ACCOUNT.md", "quarantine/README.md"] as const;

/** P02 é a única consulta que muda (R4). Todas as outras P/Q são byte a byte as da v1.0.2. */
export const V103_CHANGED_QUERY = "preflight/P02_privilegios_dono_historico.sql";

/** Entrada externa do bootstrap: a migração 0000 do staging (do repositório do staging, nunca deste projeto). */
export const STAGING_0000_INPUT = {
  file: "drizzle/migrations/0000_staging_access_control.sql",
  snapshotCommit: "608dad98",
  sha256Prefix: "a87578e560f0c97f",
  sha256Full: null as string | null,
} as const;

/** Marcadores substituídos pelos passos R40/R41 (nunca ficam com valores no pacote). */
export const REHEARSAL_PLACEHOLDERS = {
  pgdata: "__R_PGDATA__",
  sysid: "__R_SYSID__",
  sockdir: "__R_SOCKDIR__",
  port: "__R_PORT__",
  nonceSha: "__R_NONCE_SHA256__",
} as const;

export interface BlockerV103 { id: string; title: string; impact: string; missing: string; resolved: false }

export const BLOCKERS_V103: readonly BlockerV103[] = [
  { id: "B1", title: "NÃO ENSAIADO: nem a v1.0.3 nem a v1.0.2 foram aplicadas em nenhuma base (nem descartável)", impact: "Validade provada só por análise estática e pelo parser oficial. Erros que só uma base deteta não estão excluídos", missing: "Autorização separada para o plano de ensaio (REHEARSAL-PLAN.md), só numa instância descartável", resolved: false },
  { id: "B2", title: "EXECUTOR EFETIVO NÃO PROVADO (inclui o caminho de instalação de unaccent)", impact: "P01/P02 avaliam o DONO HISTÓRICO. O papel da ferramenta de migrações do staging pode ser outro, com outros privilégios para CREATE EXTENSION, CREATE no schema, REFERENCES em auth.users", missing: "Evidência independente do papel efetivo (EXECUTOR-PRIVILEGES.md). Estado PENDENTE; nada inventado", resolved: false },
  { id: "B3", title: "SEGURANÇA FUNCIONAL NÃO ESTABELECIDA: as APIs de servidor com verificação de sessão + has_staging_access AINDA NÃO EXISTEM", impact: "Os REVOKE mantêm-se (acesso só pelo servidor). service_role ignora a barreira: qualquer código de servidor tem de verificar sessão + has_staging_access", missing: "Escrever e auditar essas APIs (decisão do proprietário)", resolved: false },
  { id: "B4", title: "ADMIN DO STAGING ≠ ADMIN V2: nenhuma elevação automática", impact: "A consola de administração V2 não funciona no staging", missing: "Decisão de privilégios do proprietário", resolved: false },
  { id: "B5", title: "PERFIL AUTOMÁTICO EM QUARENTENA (QZ-02, QZ-06)", impact: "Contas de teste novas não recebem perfil, papel consultant nem categorias V2", missing: "Autorização separada + TRIGGER em auth.users + versão que não escreva em user_roles", resolved: false },
  { id: "B6", title: "SEM APAGAMENTO EM CASCATA (84 chaves para auth.users retiradas)", impact: "Apagar uma conta não apaga as linhas V2 dela", missing: "Definir o caminho de apagamento antes de haver dados de teste", resolved: false },
  { id: "B7", title: "SEM FICHEIROS NEM TEMPO REAL (QZ-03, QZ-04)", impact: "Essas funções não existem no staging", missing: "Reescrever com a barreira / só servidor e autorizar", resolved: false },
  { id: "B8", title: "TESTE COMPORTAMENTAL T01 BLOQUEADO e agora SÓ DESCARTÁVEL", impact: "A matriz está provada estaticamente e confirmável só de leitura (Q02/Q05). T01 tem uma 2.ª guarda que exige o superutilizador e o nonce da instância descartável: no staging aborta", missing: "Autorização separada, só dentro do plano de ensaio", resolved: false },
  { id: "B9", title: "VALORES POR OMISSÃO DESLIGADOS NÃO IMPEDEM ATIVAÇÕES FUTURAS", impact: "O esquema não proíbe que o servidor ou o dono liguem envios depois", missing: "Controlo de processo: qualquer ativação é decisão separada do proprietário", resolved: false },
  { id: "B10", title: "FUSÃO DE CONTAS INDISPONÍVEL (QZ-06)", impact: "A fusão de contas da consola V2 falha no staging", missing: "Reescrita com allowlist explícita, autorização separada e nova versão", resolved: false },
  { id: "B11", title: "LEITURA DE auth.identities NÃO CONFIRMADA no staging", impact: "Sem permissão, P04/P05/Q03 dão ERRO: a conta não conta como verificada", missing: "Confirmar a permissão de leitura (só leitura). Se não existir: BLOQUEIO; não retirar a verificação", resolved: false },
  { id: "B12", title: "ALVO DO ENSAIO: R10–R41 PREPARADOS, NÃO EXECUTADOS; os scripts sozinhos NÃO provam isolamento", impact: "Os scripts verificam processo, socket, configuração, rede vista pelo processo e ambiente; não veem o anfitrião, o hipervisor nem camadas fora do sistema operativo", missing: "Executar R10–R41 com autorização separada E as precondições externas E1–E9 verificadas pelo operador (B13)", resolved: false },
  { id: "B13", title: "PRECONDIÇÕES EXTERNAS E1–E9 POR VERIFICAR PELO OPERADOR", impact: "Máquina descartável, sem segredos montados, sem serviços externos, namespaces partilhados por servidor e cliente: nada disto é demonstrável só pelos scripts", missing: "O operador regista a evidência de cada E1–E9 (REHEARSAL-TARGET.md) antes de R10; sem evidência => não arrancar", resolved: false },
  { id: "B14", title: "ENTRADA 0000 DO STAGING: só o prefixo sha256 é conhecido (a87578e560f0c97f)", impact: "O bootstrap precisa da migração 0000 do staging (corpo de has_role e as 3 notas, que P03/Q04 comparam com constantes). Sem o sha256 integral, o ficheiro não pode ser conferido", missing: "Registar o sha256 integral do 0000 a partir do repositório do staging (só leitura) antes do ensaio", resolved: false },
  { id: "B15", title: "BOOTSTRAP SINTÉTICO ≠ SUPABASE REAL", impact: "Sem GoTrue, PostgREST, supautils, gatilhos de evento, Storage API nem Realtime; privilégios de auth.* e privilégios por omissão aproximados. Um ensaio aprovado não transfere automaticamente para o staging", missing: "Tratar o ensaio como prova do SQL e das verificações, não da plataforma (BOOTSTRAP-SINTETICO.md, limites L1–L10)", resolved: false },
  { id: "B16", title: "unaccent NO STAGING: estado (INSTALADA/NOVA) desconhecido até o P02 correr lá", impact: "O caminho NOVA depende de privilégios do executor real e de camadas da plataforma que o catálogo não mostra", missing: "Correr o P02 (só leitura) no staging e, com B2, confirmar o caminho; o ensaio usa a variante igual ao resultado", resolved: false },
];
