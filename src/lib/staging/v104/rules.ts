// Regras do pacote v1.0.4 para o AFONSO Staging (só preparação; nada aqui liga a uma base nem corre scripts).
//
// A auditoria independente FINAL da v1.0.3 não demonstrou defeito nas seis migrações S4 e deu NO-GO só ao
// PROCEDIMENTO DE ENSAIO. A v1.0.4:
//  - copia S4-00…S4-05 BYTE A BYTE (mesmos 6 sha256 da v1.0.2/v1.0.3), com os REVOKE/só-servidor;
//  - não altera pg_get_userbyid(oid) (F1 válido);
//  - corrige o procedimento: V1–V7, S1–S2, B1–B2, P1–P2 e E1–E10 como obrigações com evidência;
//  - mantém a migração 0000 do staging PENDENTE e só prepara a interface de entrada (nada inventado).

export const V104_VERSION = "1.0.4";
export const V104_PREVIOUS = { version: "1.0.3", commit: "fd4fdaca" } as const;
export const V104_PREVIOUS_DIR = "staging-install/package/v1.0.3";

/** sha256 das 6 migrações auditadas (iguais desde a v1.0.2). A montagem e o teste falham se mudarem. */
export const V104_PRESERVED_SQL_SHA256: Readonly<Record<string, string>> = {
  "S4-00_prelude_aditivo.sql": "23f198ffa3135153efb015008e10368829c78ac2548a6a0056efa4738d2f828c",
  "S4-01_tipos_tabelas_a.sql": "5724b20543f0716e3c818e186e8a56cb5fc66790f671796a1e2e2968787aaf55",
  "S4-02_tabelas_b_restricoes.sql": "5b8fae75417e16e25cb21d80f7ba47ea8aab11237f9c3dc95020bd922c778cc4",
  "S4-03_funcoes.sql": "68f244fffb97280eaedda9054784ccc0952936e9405838968e0a5cfe6fe4846a",
  "S4-04_indices_chaves_gatilhos.sql": "8ba1230d83e7c8794ec9d2b8200ac1ef79739f2cd9f96439ee8fb266d4dba2ba",
  "S4-05_politicas.sql": "6276b63eb5bd6c1c54c41dbc535e2dd62f18f83d910037d7e48cc25a30fa8543",
};

/** Documentos escritos à mão que continuam válidos sem alteração (copiados da v1.0.3). */
export const V104_COPIED_HANDWRITTEN = ["COLLISIONS.md", "OWNER-ACCOUNT.md", "quarantine/README.md"] as const;

/** P02 é a única consulta P/Q que muda (P1 dicionário unaccent; P2 sem pressupor o OID 10). */
export const V104_CHANGED_QUERY = "preflight/P02_privilegios_dono_historico.sql";

/**
 * Entrada externa: a migração 0000 histórica do staging. Os METADADOS foram localizados no código do AFONSO
 * Staging e comunicados pelo proprietário; os BYTES originais NÃO foram obtidos (nenhuma transferência
 * autorizada recebida). Por isso continua PENDENTE: nenhum ficheiro é incluído nem reconstruído.
 */
export const STAGING_0000_INPUT_V104 = {
  file: "drizzle/migrations/0000_staging_access_control.sql",
  gitCommit: "ab5187829bb989795d47a283e0f093b796843e72",
  gitBlob: "24c38a525e549551e1fdf3028ff58e1e1906b0ee",
  previousSnapshotRef: "608dad98",
  sha256Prefix: "a87578e560f0c97f",
  sha256Full: "a87578e560f0c97f9c1184d5fe3e2730f18de6e513b8e610c4808a28f98aecd2",
  bytes: 2303,
  lines: 44,
  trailingNewline: false,
  bytesObtained: false,
  metadataSource: "localizado pelo proprietário no código do AFONSO Staging; registado sem os bytes",
  alternativeBootstrap: null as string | null,
  state: "PENDENTE",
  caveat: "Input histórico do repositório do staging: correspondência com a base de dados real do staging NÃO verificada; contém 3 INSERTs sintéticos (as 3 notas de staging_notes)",
} as const;

/** Conta sintética única do ensaio (email reservado .invalid). */
export const SYNTHETIC_EMAIL = "proprietario.sintetico@afonso-staging.invalid";

/**
 * Passos de sessão do wrapper único (tools/R40_sessao.sh). A ordem é obrigatória; cada passo exige o
 * anterior aprovado. Espelhado à letra na tabela `passo_def` do script (o teste compara as duas).
 *  - base/papel: o que a sessão TEM de ser (R31 confirma antes e depois do ficheiro);
 *  - super: se o papel é o superutilizador do ensaio (só então corre o R32: PGDATA, sysid, nonce, socket);
 *  - tx: ficheiro numa transação única (psql -1);
 *  - desbloquear: a cópia retira EXATAMENTE a 1.ª linha de guarda BLOQUEADO (só ficheiros *.bloqueado.sql);
 *  - marcadores: os ÚNICOS marcadores que a cópia deste passo pode substituir; qualquer outro que reste => REPROVADO.
 */
export interface SessionStep { passo: string; ficheiro: string; base: "postgres" | "afonso_ensaio"; papel: "ensaio_super" | "postgres"; super: boolean; tx: boolean; desbloquear: boolean; marcadores: readonly string[]; variante?: "INSTALADA" }
const INST = ["__R_PGDATA__", "__R_SYSID__", "__R_SOCKDIR__", "__R_PORT__", "__R_NONCE_SHA256__"] as const;
const P05M = ["__P05_B01_CONTA__", "__P05_B02_IDENTIDADES__", "__P05_B03_PAPEIS__", "__P05_B04_POLITICAS__", "__P05_B05_FUNCOES__", "__P05_B06_TABELAS__", "__P05_B07_TIPO__"] as const;
const q = (dir: string, n: string, extra: readonly string[] = []): SessionStep => ({ passo: n.slice(0, 3), ficheiro: `${dir}/${n}`, base: "afonso_ensaio", papel: "postgres", super: false, tx: true, desbloquear: false, marcadores: extra });
export const SESSION_STEPS: readonly SessionStep[] = [
  { passo: "R30", ficheiro: "ensaio/R30_sessao_alvo.sql", base: "postgres", papel: "ensaio_super", super: true, tx: false, desbloquear: false, marcadores: INST },
  { passo: "B00", ficheiro: "ensaio/B00_papeis_e_base.bloqueado.sql", base: "postgres", papel: "ensaio_super", super: true, tx: false, desbloquear: true, marcadores: INST },
  { passo: "B01", ficheiro: "ensaio/B01_plataforma_sintetica.bloqueado.sql", base: "afonso_ensaio", papel: "ensaio_super", super: true, tx: true, desbloquear: true, marcadores: INST },
  { passo: "B01b", ficheiro: "ensaio/B01b_unaccent_instalada.bloqueado.sql", base: "afonso_ensaio", papel: "ensaio_super", super: true, tx: true, desbloquear: true, marcadores: INST, variante: "INSTALADA" },
  { passo: "0000", ficheiro: "entradas/0000 (externo, conferido pelo R05)", base: "afonso_ensaio", papel: "postgres", super: false, tx: true, desbloquear: false, marcadores: [] },
  { passo: "B02", ficheiro: "ensaio/B02_papel_admin_sintetico.bloqueado.sql", base: "afonso_ensaio", papel: "ensaio_super", super: true, tx: true, desbloquear: true, marcadores: INST },
  q("preflight", "P00_alvo.sql"),
  q("preflight", "P01_dono_historico.sql"),
  q("preflight", "P02_privilegios_dono_historico.sql"),
  q("preflight", "P03_colisoes.sql"),
  q("preflight", "P04_conta_proprietario.sql", ["__EMAIL_AUTORIZADO__"]),
  q("preflight", "P05_registo_base.sql", ["__EMAIL_AUTORIZADO__"]),
  ...Object.keys(V104_PRESERVED_SQL_SHA256).map((n) => ({ ...q("sql", n), passo: n.slice(0, 5) })),
  q("posflight", "Q00_alvo.sql"),
  q("posflight", "Q01_estrutura.sql"),
  q("posflight", "Q02_seguranca.sql"),
  q("posflight", "Q03_conta_proprietario.sql", ["__EMAIL_AUTORIZADO__", ...P05M.slice(0, 3)]),
  q("posflight", "Q04_acesso_staging.sql", P05M.slice(3)),
  q("posflight", "Q05_matriz_acesso.sql"),
  { passo: "T01", ficheiro: "tests-db/T01_matriz_comportamental.bloqueado.sql", base: "afonso_ensaio", papel: "ensaio_super", super: true, tx: false, desbloquear: true, marcadores: INST },
];

/** Marcadores das consultas de sessão (sempre substituídos pelo R40 nas cópias). */
export const R31_MARKERS = ["__R_DB__", "__R_ROLE__", "__R_SUPER__", "__R_PORT__", "__R_PGSTART__"] as const;
export const R32_MARKERS = ["__R_PGDATA__", "__R_SYSID__", "__R_SOCKDIR__", "__R_NONCE_SHA256__"] as const;
export const P05_MARKER_FROM_ID: Readonly<Record<string, string>> = Object.fromEntries(P05M.map((m) => [m.slice(6, 9), m]));

/** Obrigações externas do operador (fora do alcance dos scripts). R10 recusa arrancar sem todas registadas. */
export const OPERATOR_OBLIGATIONS = ["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9", "E10"] as const;

export interface BlockerV104 { id: string; title: string; impact: string; missing: string; resolved: false }

export const BLOCKERS_V104: readonly BlockerV104[] = [
  { id: "B1", title: "NÃO ENSAIADO: nenhuma versão (v1.0.0…v1.0.4) foi aplicada em nenhuma base, nem descartável; nenhum script do ensaio foi corrido", impact: "Validade só por análise estática e pelo parser oficial. Erros que só uma base ou o /proc real mostram não estão excluídos (o V1/V3 da v1.0.3 eram desse tipo)", missing: "Autorização separada para o REHEARSAL-PLAN.md, só numa instância descartável", resolved: false },
  { id: "B2", title: "EXECUTOR EFETIVO NÃO PROVADO (inclui o caminho de unaccent)", impact: "P01/P02 avaliam o DONO HISTÓRICO, não o papel da ferramenta de migrações do staging", missing: "Evidência independente do papel efetivo (EXECUTOR-PRIVILEGES.md). PENDENTE", resolved: false },
  { id: "B3", title: "SEGURANÇA FUNCIONAL NÃO ESTABELECIDA: as APIs de servidor com verificação de sessão + has_staging_access AINDA NÃO EXISTEM", impact: "Os REVOKE mantêm-se (só servidor); service_role ignora a barreira", missing: "Escrever e auditar essas APIs (decisão do proprietário)", resolved: false },
  { id: "B4", title: "ADMIN DO STAGING ≠ ADMIN V2: nenhuma elevação automática", impact: "A consola de administração V2 não funciona no staging", missing: "Decisão de privilégios do proprietário", resolved: false },
  { id: "B5", title: "PERFIL AUTOMÁTICO EM QUARENTENA (QZ-02, QZ-06)", impact: "Contas de teste novas não recebem perfil, papel nem categorias V2", missing: "Autorização separada + versão que não escreva em user_roles", resolved: false },
  { id: "B6", title: "SEM APAGAMENTO EM CASCATA (84 chaves para auth.users retiradas)", impact: "Apagar uma conta não apaga as linhas V2 dela", missing: "Definir o caminho de apagamento antes de haver dados de teste", resolved: false },
  { id: "B7", title: "SEM FICHEIROS NEM TEMPO REAL (QZ-03, QZ-04)", impact: "Essas funções não existem no staging", missing: "Reescrever com a barreira / só servidor e autorizar", resolved: false },
  { id: "B8", title: "T01 BLOQUEADO e SÓ DESCARTÁVEL", impact: "A matriz está provada estaticamente e confirmável só de leitura (Q02/Q05)", missing: "Autorização separada, só dentro do plano de ensaio", resolved: false },
  { id: "B9", title: "VALORES POR OMISSÃO DESLIGADOS NÃO IMPEDEM ATIVAÇÕES FUTURAS", impact: "O esquema não proíbe que o servidor ou o dono liguem envios depois", missing: "Controlo de processo: qualquer ativação é decisão separada do proprietário", resolved: false },
  { id: "B10", title: "FUSÃO DE CONTAS INDISPONÍVEL (QZ-06)", impact: "A fusão de contas da consola V2 falha no staging", missing: "Reescrita com allowlist explícita, autorização separada e nova versão", resolved: false },
  { id: "B11", title: "LEITURA DE auth.identities NÃO CONFIRMADA no staging", impact: "Sem permissão, P04/P05/Q03 dão ERRO: a conta não conta como verificada", missing: "Confirmar a permissão de leitura (só leitura). Se não existir: BLOQUEIO", resolved: false },
  { id: "B12", title: "ALVO DO ENSAIO: R05–R90 PREPARADOS, NÃO EXECUTADOS; os scripts sozinhos NÃO provam isolamento", impact: "Os scripts veem o processo (/proc, ficheiros, sockets, cgroup), não o anfitrião, o hipervisor nem a rede da plataforma", missing: "Executar com autorização separada E as obrigações E1–E10 cumpridas pelo operador (B13)", resolved: false },
  { id: "B13", title: "OBRIGAÇÕES EXTERNAS E1–E10 POR CUMPRIR PELO OPERADOR", impact: "O R10 só confere que a ficha de evidência existe, está completa e não diz PENDENTE; não consegue confirmar que é verdadeira", missing: "O operador preenche operador/E-EVIDENCIA.modelo com a evidência de cada obrigação; sem ela o R10 recusa", resolved: false },
  { id: "B14", title: "ENTRADA 0000 DO STAGING PENDENTE: metadados registados (commit ab518782, blob 24c38a52, sha256 a87578e5…aecd2, 2303 bytes, 44 linhas, sem LF final), BYTES ORIGINAIS NÃO OBTIDOS", impact: "Sem os bytes originais o pacote não inclui o ficheiro, o ESPERADO fica PENDENTE, o R10/R05 recusam e o passo 0000 não corre. Nada foi reconstruído a partir de texto", missing: "Transferência AUTORIZADA do ficheiro byte-exato do repositório do staging; conferir sha256, blob Git, tamanho, linhas e ausência de LF final; só então incorporá-lo como input histórico auditado (ressalva: correspondência com a BD real não verificada; contém 3 INSERTs sintéticos)", resolved: false },
  { id: "B15", title: "BOOTSTRAP SINTÉTICO ≠ SUPABASE REAL", impact: "Sem GoTrue, PostgREST, supautils, Storage API, Realtime; privilégios aproximados", missing: "Tratar o ensaio como prova do SQL e das verificações, não da plataforma (L1–L10)", resolved: false },
  { id: "B16", title: "unaccent NO STAGING: estado (INSTALADA/NOVA) desconhecido até o P02 correr lá", impact: "O caminho NOVA depende do executor real e de camadas da plataforma", missing: "Correr o P02 (só leitura) no staging e, com B2, confirmar o caminho", resolved: false },
  { id: "B17", title: "R90 PODE DECLARAR INCERTEZA: nesse caso a máquina TEM de ser destruída", impact: "Se o cgroup/unidade não ficar vazio ou não puder ser lido, os scripts não conseguem garantir que nenhum processo do ensaio sobreviveu", missing: "Obrigação E1/E10: destruir a VM/contentor sempre que o R90 termine com INCERTEZA (código 3)", resolved: false },
  { id: "B18", title: "psql E shell NÃO EXERCITADOS: guiões .psql e scripts só verificados estaticamente", impact: "O comportamento real de \\gset/\\if/\\g, dos /proc/<pid>/stat e do cgroup v2 não foi observado; shellcheck/dash -n são análise estática", missing: "Só o ensaio autorizado o pode observar", resolved: false },
];
