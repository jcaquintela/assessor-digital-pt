// Regras do pacote v1.0.5 para o AFONSO Staging (só preparação; nada aqui liga a uma base nem corre scripts).
//
// A auditoria independente da v1.0.4 deu NO-GO ao PROCEDIMENTO DE ENSAIO (X1–X3 e reforços). A v1.0.5:
//  - copia S4-00…S4-05 e a entrada 0000 AUTENTICADA BYTE A BYTE (mesmos hashes da v1.0.4);
//  - altera só os scripts do ensaio, a ficha E1–E10 e os documentos; acrescenta um teste de regressão
//    estático reproduzível DENTRO do pacote (verificacao/V01_regressao_estatica.mjs).
import { BLOCKERS_V104, STAGING_0000_INPUT_V104, V104_PRESERVED_SQL_SHA256, type BlockerV104 } from "../v104/rules";

export const V105_VERSION = "1.0.5";
export const V105_PREVIOUS = { version: "1.0.4", commit: "4d531df9" } as const;
export const V105_PREVIOUS_DIR = "staging-install/package/v1.0.4";

/** sha256 das 6 migrações auditadas (iguais desde a v1.0.2). */
export const V105_PRESERVED_SQL_SHA256 = V104_PRESERVED_SQL_SHA256;
/** Entrada 0000 autenticada: o mesmo ficheiro, byte a byte, da v1.0.4. */
export const STAGING_0000_INPUT_V105 = STAGING_0000_INPUT_V104;

/** Ficheiros escritos à mão ALTERADOS na v1.0.5 (vivem na pasta do pacote). */
export const V105_CHANGED_HANDWRITTEN = [
  "tools/lib_ensaio.sh",
  "tools/R05_entrada_0000.sh",
  "tools/R10_arranque_controlado.sh",
  "tools/R20_verificar_processo.sh",
  "tools/R40_sessao.sh",
  "tools/R90_descartar.sh",
  "operador/E-EVIDENCIA.modelo",
  "README.md",
  "REHEARSAL-TARGET.md",
  "REHEARSAL-PLAN.md",
  "TEST-CRITERIA.md",
  "FINDINGS-RESOLUTION.md",
  "evidence/shell-check.txt",
] as const;
/** Ficheiros NOVOS na v1.0.5. */
export const V105_NEW = ["verificacao/V01_regressao_estatica.mjs", "evidence/regressao-estatica.txt", "DIFF-v1.0.4.md"] as const;
/** Ficheiros da v1.0.4 que saem (substituídos). */
export const V105_RETIRED = ["DIFF-v1.0.3.md"] as const;
/** Gerados a cada montagem (não se copiam da v1.0.4). */
export const V105_GENERATED = ["MANIFEST.json", "SHA256SUMS", "DIFF-v1.0.4.md", "BLOCKERS.md"] as const;

export interface FindingV105 { id: string; achado: string; correcao: string; prova: string }

/** Achados da auditoria da v1.0.4 e a correção de cada um (todos: corrigido, NÃO executado). */
export const FINDINGS_V105: readonly FindingV105[] = [
  { id: "X1", achado: "lib_ensaio.sh:145 — o ciclo de HOME devolvia erro quando a última linha não era HOME (o corpo terminava em `[ … ] && _achou=sim`) e o `|| fail` reprovava sempre", correcao: "Corpo com `case`/`if` (código 0); conta as definições HOME e exige EXATAMENTE uma, igual à pasta do ensaio; lê a última linha mesmo sem LF. Regra geral: nenhum ciclo `done … ||` termina numa lista `&&`", prova: "V01 X1-0 (controlo negativo com o padrão da v1.0.4), X1-1 (todos os scripts), X1-2" },
  { id: "X2", achado: "R90:66-79, R10:49-51, R20:68-80 — `cgroup.procs` não lista processos de subcgroups descendentes", correcao: "Montagem cgroup v2 única em /sys/fs/cgroup com raiz / e sem v1 (`cgroup2_ou_falha`); R10/R20 exigem `nr_descendants 0` e nenhuma subpasta (R20 antes e depois de ler `cgroup.procs`) e `populated 1`; o R90 decide \"vazia\" por `cgroup.events` `populated 0`, que cobre os descendentes; `cgroup.kill` mata a subárvore; E10 reescrita", prova: "V01 X2-1…X2-6" },
  { id: "X3", achado: "R90:55-62 e trap do R10 — identidade não relida imediatamente antes dos sinais (SIGQUIT sem nova verificação; trap só por executável+cwd); falhas depois de o descarte começar podiam sair com 2", correcao: "`sinaliza_se_mesmo`: relê a identidade COMPLETA e compara byte a byte imediatamente antes de CADA sinal; o trap do R10 usa a identidade registada ou uma provisória (início lido logo após o arranque, pai = R10, executável, cwd, cgroup) e sai com 3 em dúvida; no R90, a partir de `DESCARTE=1`, `fail` dá 3 e o EXIT trap converte qualquer saída ≠ 0 em 3. Corrida residual documentada (RR1)", prova: "V01 X3-0…X3-7" },
  { id: "F-E", achado: "Ficha E1–E10 aceitava oito caracteres quaisquer como evidência", correcao: "Cada En = artefacto|sha256|descrição: artefacto na pasta da ficha (≥ 64 bytes, sem ligações simbólicas) com sha256 que confere, descrição ≥ 30 caracteres e ≥ 5 palavras sem marcadores de \"por fazer\", sem repetições; data válida e não futura; artefactos copiados para evidencia/E-artefactos/. Continua a ser só FORMA (B13)", prova: "V01 F1, F2" },
  { id: "F-T", achado: "Sem trinco global: dois passos podiam correr ao mesmo tempo em <ROOT>", correcao: "Trinco `<ROOT>/.trinco` (mkdir atómico, dono PID+início): R05, R10 e R40 seguram-no; R20/R41 só leem; o R90 recusa se o dono ainda corre e assume órfãos", prova: "V01 T1, T2" },
  { id: "F-K", achado: "Campos-token da tabela de passos não cobertos: um nome mal escrito era ignorado em silêncio", correcao: "R40 exige 7 campos, valida cada um (ficheiro, base, papel, super/tx/desbloquear e coerência), nomes-token só da lista, sem repetidos, e cada token tem de cobrir ≥ 1 campo `__…__` da fonte; a V01 confere tabela, MANIFEST e fontes", prova: "V01 K1…K4" },
  { id: "F-R", achado: "Alegações de testes não incluídos no pacote", correcao: "Teste de regressão estático no pacote (verificacao/V01) com saída guardada em evidence/regressao-estatica.txt; os documentos já não citam como prova testes que estão fora do pacote", prova: "V01 D1 e o próprio V01" },
];

/** Corridas residuais assumidas (não elimináveis por scripts sh). */
export const RESIDUAL_RISKS_V105 = [
  { id: "RR1", text: "Entre a releitura da identidade e o kill(2) o processo pode terminar e o PID ser reutilizado (sem pidfd em sh). Janela mínima; E1 cobre o resto." },
  { id: "RR2", text: "Um subcgroup criado entre as duas verificações do R20 só é visto no R20 seguinte; o R90 não depende disto (populated cobre os descendentes)." },
  { id: "RR3", text: "O trinco é cooperativo: só os scripts do pacote o respeitam; um trinco sem dono registado é tratado como órfão pelo R90." },
  { id: "RR4", text: "A ficha E1–E10 continua a provar só forma e integridade dos artefactos, nunca a verdade (B13)." },
] as const;

export type BlockerV105 = BlockerV104;
export const BLOCKERS_V105: readonly BlockerV105[] = BLOCKERS_V104.map((b) => {
  if (b.id === "B1") return { ...b, title: "NÃO ENSAIADO: nenhuma versão (v1.0.0…v1.0.5) foi aplicada em nenhuma base, nem descartável; nenhum script do ensaio foi corrido" };
  if (b.id === "B13") return { ...b, impact: "O R10 confere a forma da ficha e a integridade dos 10 artefactos de evidência (sha256), não a verdade deles" };
  if (b.id === "B18") return { ...b, impact: "O comportamento real de \\gset/\\if/\\g, /proc/<pid>/stat, cgroup.events/cgroup.stat/cgroup.kill, do EXIT trap e do trinco não foi observado; V01, sh -n/bash -n/dash -n e shellcheck são análise estática" };
  return b;
}).concat([
  { id: "B19", title: "CORRIDAS RESIDUAIS RR1–RR3 ASSUMIDAS (PID entre releitura e kill; subcgroup entre verificações; trinco cooperativo)", impact: "Não elimináveis em sh; ver REHEARSAL-TARGET.md §3", missing: "E1: destruir a máquina no fim e em qualquer INCERTEZA", resolved: false },
]);
