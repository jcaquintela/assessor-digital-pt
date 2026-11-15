// Regras do pacote v1.0.6 para o AFONSO Staging (só preparação; nada aqui liga a uma base nem corre scripts).
//
// A auditoria independente do ZIP v1.0.5 deu NO-GO ao PROCEDIMENTO DE ENSAIO (Y1–Y3). A v1.0.6:
//  - copia S4-00…S4-05 e a entrada 0000 AUTENTICADA BYTE A BYTE (mesmos hashes da v1.0.5);
//  - altera só lib_ensaio.sh, R05, R40, R90, a V01 e os documentos; R10, R20, R41 e o resto ficam iguais.
import { SESSION_STEPS } from "../v104/rules";
import { BLOCKERS_V105, RESIDUAL_RISKS_V105, STAGING_0000_INPUT_V105, V105_PRESERVED_SQL_SHA256, type BlockerV105 } from "../v105/rules";

export const V106_VERSION = "1.0.6";
export const V106_PREVIOUS = { version: "1.0.5", commit: "db6297dd" } as const;
export const V106_PREVIOUS_DIR = "staging-install/package/v1.0.5";

/** sha256 das 6 migrações auditadas (iguais desde a v1.0.2). */
export const V106_PRESERVED_SQL_SHA256 = V105_PRESERVED_SQL_SHA256;
/** Entrada 0000 autenticada: o mesmo ficheiro, byte a byte, da v1.0.5. */
export const STAGING_0000_INPUT_V106 = STAGING_0000_INPUT_V105;

/** Sequência única do ensaio (Y3): a mesma no MANIFEST, nos documentos e imposta pelos scripts. */
export const REHEARSAL_SEQUENCE_V106 = [
  "E1–E10", "R10", "R20", "R05",
  ...SESSION_STEPS.map((s) => (s.passo === "B01b" ? "[R40 B01b]" : `R40 ${s.passo}`)).reduce<string[]>((acc, x) => {
    // Agrupa P00…P05, S4-00…S4-05 e Q00…Q05 como nos documentos.
    const grupo = /^R40 (P0[0-5]|S4-0[0-5]|Q0[0-5])$/.exec(x)?.[1];
    if (!grupo) return [...acc, x];
    const nome = grupo.startsWith("P") ? "R40 P00…P05" : grupo.startsWith("S4") ? "R40 S4-00…S4-05" : "R40 Q00…Q05";
    return acc[acc.length - 1] === nome ? acc : [...acc, nome];
  }, []),
  "R90",
] as const;

/** Ficheiros escritos à mão ALTERADOS na v1.0.6 (vivem na pasta do pacote). */
export const V106_CHANGED_HANDWRITTEN = [
  "tools/lib_ensaio.sh",
  "tools/R05_entrada_0000.sh",
  "tools/R40_sessao.sh",
  "tools/R90_descartar.sh",
  "verificacao/V01_regressao_estatica.mjs",
  "README.md",
  "REHEARSAL-TARGET.md",
  "REHEARSAL-PLAN.md",
  "TEST-CRITERIA.md",
  "FINDINGS-RESOLUTION.md",
  "evidence/shell-check.txt",
  "evidence/regressao-estatica.txt",
] as const;
/** Ficheiros NOVOS na v1.0.6. */
export const V106_NEW = ["DIFF-v1.0.5.md"] as const;
/** Ficheiros da v1.0.5 que saem (substituídos). */
export const V106_RETIRED = ["DIFF-v1.0.4.md"] as const;
/** Gerados a cada montagem (não se copiam da v1.0.5). */
export const V106_GENERATED = ["MANIFEST.json", "SHA256SUMS", "DIFF-v1.0.5.md", "BLOCKERS.md"] as const;

export interface FindingV106 { id: string; achado: string; correcao: string; prova: string }

/** Bloqueios da auditoria do ZIP v1.0.5 e a correção de cada um (todos: corrigido, NÃO executado). */
export const FINDINGS_V106: readonly FindingV106[] = [
  { id: "Y1", achado: "tools/R40_sessao.sh:112 — SIGTERM ao cliente psql sem reconfirmar a identidade imediatamente antes", correcao: "Único `kill` do pacote em `sinaliza_se_mesmo`; `cliente_termina` no EXIT trap do R40 com referência aceite só por início do lançamento, executável do psql do R10, namespaces, cgroup e pai = wrapper; vivo e não confirmado => nada enviado, trinco não libertado, código 3. Janela residual RR1/RR5 documentada", prova: "V01 Y1-0 (controlo negativo), Y1-1…Y1-5, X3-1" },
  { id: "Y2", achado: "tools/R90_descartar.sh:60-68 — trinco órfão removido e adquirido antes de DESCARTE=1: falha => código 2 depois de alterar <ROOT>", correcao: "`DESCARTE=1`/`CODIGO_FALHA=3` imediatamente antes da 1.ª alteração; antes só leitura; depois todos os caminhos dão 3 (fail, incerteza, exit 3, funções da biblioteca via EXIT trap, set -e); linha final escrita com o trap ativo", prova: "V01 Y2-0 (controlo negativo), Y2-1…Y2-4, X3-4, X3-5" },
  { id: "Y3", achado: "REHEARSAL-PLAN.md:57-58,66 — ordem R05/R10 contraditória", correcao: "Sequência única `rehearsal_sequence` no MANIFEST, igual em README, REHEARSAL-PLAN, REHEARSAL-TARGET e TEST-CRITERIA; tabelas por ordem; R05 exige o R10 terminado, corre o R20, recusa sessões do R40 e grava R05.aprovado; o R40 recusa qualquer passo sem ele", prova: "V01 Y3-0 (controlo negativo), Y3-1…Y3-4, T1" },
];

/** Corridas residuais assumidas (não elimináveis por scripts sh). */
export const RESIDUAL_RISKS_V106 = [
  { id: "RR1", text: "Entre a releitura da identidade e o kill(2) o processo pode terminar e o PID ser reutilizado (sem pidfd em sh); vale para o postmaster (R10, R90) e para o psql (R40), que o shell pode recolher sozinho. Janela mínima; E1 cobre o resto." },
  ...RESIDUAL_RISKS_V105.filter((r) => r.id !== "RR1"),
  { id: "RR5", text: "Entre o lançamento e o exec do psql a identidade não pode ser confirmada: nada é enviado e o R40 sai com 3 (fecho por excesso; destruir a máquina, E1)." },
] as const;

export type BlockerV106 = BlockerV105;
export const BLOCKERS_V106: readonly BlockerV106[] = BLOCKERS_V105.map((b) => {
  if (b.id === "B1") return { ...b, title: "NÃO ENSAIADO: nenhuma versão (v1.0.0…v1.0.6) foi aplicada em nenhuma base, nem descartável; nenhum script do ensaio foi corrido" };
  if (b.id === "B18") return { ...b, impact: "O comportamento real de \\gset/\\if/\\g, /proc/<pid>/stat, cgroup.events/cgroup.stat/cgroup.kill, do EXIT trap, do trinco e da recolha do psql pelo shell não foi observado; V01, sh -n/bash -n/dash -n e shellcheck são análise estática" };
  if (b.id === "B19") return { ...b, title: "CORRIDAS RESIDUAIS RR1–RR3 e RR5 ASSUMIDAS (PID entre releitura e kill, também no psql do R40; subcgroup entre verificações; trinco cooperativo; psql antes do exec)", impact: "Não elimináveis em sh; ver REHEARSAL-TARGET.md §3" };
  return b;
});
