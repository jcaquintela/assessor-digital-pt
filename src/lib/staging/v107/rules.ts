// Regras do pacote v1.0.7 para o AFONSO Staging (só preparação; nada aqui liga a uma base nem corre scripts).
//
// A auditoria independente do ZIP v1.0.6 deu NO-GO ao PROCEDIMENTO DE ENSAIO (Z1, Z2: trinco global). A v1.0.7:
//  - copia S4-00…S4-05 e a entrada 0000 AUTENTICADA BYTE A BYTE (mesmos hashes da v1.0.6);
//  - altera só lib_ensaio.sh, R05, R10, R40, R90, a V01 e os documentos; R20, R41 e o resto ficam iguais.
import { BLOCKERS_V106, REHEARSAL_SEQUENCE_V106, RESIDUAL_RISKS_V106, STAGING_0000_INPUT_V106, V106_PRESERVED_SQL_SHA256, type BlockerV106 } from "../v106/rules";

export const V107_VERSION = "1.0.7";
export const V107_PREVIOUS = { version: "1.0.6", commit: "3f6441b2" } as const;
export const V107_PREVIOUS_DIR = "staging-install/package/v1.0.6";

/** sha256 das 6 migrações auditadas (iguais desde a v1.0.2). */
export const V107_PRESERVED_SQL_SHA256 = V106_PRESERVED_SQL_SHA256;
/** Entrada 0000 autenticada: o mesmo ficheiro, byte a byte, da v1.0.6. */
export const STAGING_0000_INPUT_V107 = STAGING_0000_INPUT_V106;
/** Sequência única do ensaio: igual à da v1.0.6 (Z1/Z2 não mudam a ordem). */
export const REHEARSAL_SEQUENCE_V107 = REHEARSAL_SEQUENCE_V106;

/** Ficheiros escritos à mão ALTERADOS na v1.0.7 (vivem na pasta do pacote). */
export const V107_CHANGED_HANDWRITTEN = [
  "tools/lib_ensaio.sh",
  "tools/R05_entrada_0000.sh",
  "tools/R10_arranque_controlado.sh",
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
/** Ficheiros NOVOS na v1.0.7. */
export const V107_NEW = ["DIFF-v1.0.6.md"] as const;
/** Ficheiros da v1.0.6 que saem (substituídos). */
export const V107_RETIRED = ["DIFF-v1.0.5.md"] as const;
/** Gerados a cada montagem (não se copiam da v1.0.6). */
export const V107_GENERATED = ["MANIFEST.json", "SHA256SUMS", "DIFF-v1.0.6.md", "BLOCKERS.md"] as const;

export interface FindingV107 { id: string; achado: string; correcao: string; prova: string }

/** Bloqueios da auditoria do ZIP v1.0.6 e a correção de cada um (todos: corrigido, NÃO executado). */
export const FINDINGS_V107: readonly FindingV107[] = [
  { id: "Z1", achado: "tools/R90_descartar.sh:61-75 — juízo do dono e depois rm -rf de <ROOT>/.trinco: um trinco adquirido entretanto por um passo vivo podia ser apagado (TOCTOU); a libertação (lib:302-308, R90:160-161) também apagava no caminho partilhado", correcao: "Nenhum script apaga no caminho partilhado. Aquisição só por mkdir; dono escrito por rename (pid, início, namespace de PIDs, boot_id, nonce, passo). Libertar e assumir órfão = rename(2) para nome privado + confirmação posterior (dispositivo:inode + dono byte a byte, de novo TERMINADO) e só então apagar a cópia privada; não confirmado => nada apagado, código 3. Libertação falhada => código 3 em R10, R05, R40 e R90, antes da linha de aprovação. Sem garantia atómica de verificar-e-apagar em sh: RR6 documentado", prova: "V01 Z1-0 (controlo negativo), Z1-1…Z1-7, T1, T2, Y2-1…Y2-3" },
  { id: "Z2", achado: "tools/lib_ensaio.sh:309-317 — trinco_vivo com dois valores: uma falha de leitura do dono dava \"não vivo\" e o R90 tratava o trinco como órfão", correcao: "trinco_estado com três valores. TERMINADO só com prova (dono completo, mesmo namespace de PIDs e arranque, e PID ausente, PID com outro início ou o dono em Z/X); qualquer falha de leitura ou dúvida => INDETERMINADO. No R90: VIVO => 2, nada tocado; INDETERMINADO => INCERTEZA 3 antes de qualquer alteração, sem remover; só TERMINADO é assumido", prova: "V01 Z2-0 (controlo negativo), Z2-1…Z2-3" },
];

/** Corridas residuais assumidas (não elimináveis por scripts sh). */
export const RESIDUAL_RISKS_V107 = [
  ...RESIDUAL_RISKS_V106.filter((r) => r.id !== "RR3"),
  { id: "RR3", text: "O trinco é cooperativo: só os scripts do pacote o respeitam; um processo que o ignore (ou que apague/mova <ROOT>/.trinco) não é travado. E8/E9: só os scripts do pacote correm em <ROOT>." },
  { id: "RR6", text: "Entre o juízo TERMINADO e o rename(2) outro R90 pode assumir o mesmo órfão e adquirir o trinco; o rename move então o trinco vivo dele. É detetado DEPOIS (dispositivo:inode e nonce diferentes): nada é apagado e o R90 sai com 3; o passo que perdeu o trinco também sai com 3 ao libertá-lo, mas até lá corre sem trinco no caminho partilhado. Não há verificar-e-apagar atómico em sh: só um R90 de cada vez (operador)." },
  { id: "RR7", text: "TERMINADO assenta no /proc do mesmo namespace de PIDs e no boot_id: um /proc que não mostre o namespace do leitor não é detetável pelo processo (E4). O rename(2)/mkdir(2) só são atómicos num sistema de ficheiros local (montagens de rede/FUSE recusadas pelo R10/R20/R40)." },
].sort((a, b) => (a.id < b.id ? -1 : 1));

export type BlockerV107 = BlockerV106;
export const BLOCKERS_V107: readonly BlockerV107[] = BLOCKERS_V106.map((b) => {
  if (b.id === "B1") return { ...b, title: "NÃO ENSAIADO: nenhuma versão (v1.0.0…v1.0.7) foi aplicada em nenhuma base, nem descartável; nenhum script do ensaio foi corrido" };
  if (b.id === "B18") return { ...b, impact: "O comportamento real de \\gset/\\if/\\g, /proc/<pid>/stat, cgroup.events/cgroup.stat/cgroup.kill, do EXIT trap, do trinco (mkdir/rename concorrentes, mv -T, boot_id, uuid) e da recolha do psql pelo shell não foi observado; V01, sh -n/bash -n/dash -n e shellcheck são análise estática" };
  if (b.id === "B19") return { ...b, title: "CORRIDAS RESIDUAIS RR1–RR3 e RR5–RR7 ASSUMIDAS (PID entre releitura e kill, também no psql do R40; subcgroup entre verificações; trinco cooperativo; psql antes do exec; R90 concorrentes entre juízo e rename; /proc e sistema de ficheiros)", impact: "Não elimináveis em sh; ver REHEARSAL-TARGET.md §3" };
  return b;
});
