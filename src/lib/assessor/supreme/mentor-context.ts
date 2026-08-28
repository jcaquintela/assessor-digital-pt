// MENTOR — NÍVEL 2 (CONTEXTUAL)
// Módulo puro: recebe factos já apurados e compõe a linha de contexto.
// Nunca lê da BD, nunca inventa. Vocabulário de negócio da indústria:
//   Crescimento   = entrada nova no funil (leads/pessoas novas)
//   Produtividade = trabalhar o que já existe (seguimentos fechados, pipeline a mexer)
//
// TOM (regra do produto): nomear o sinal e o período, reconhecer o que houve,
// terminar em pergunta ou convite. Nunca juízo, nunca linguagem de falha.
// Não é "não estás a prospetar", é "esta semana o sinal é de baixo Crescimento".
//
// NÍVEL 3 "Mentor Pleno" (coaching preditivo por taxas de conversão do funil)
// fica deliberadamente fora deste módulo até haver histórico suficiente.

export type Sinal = "baixo" | "morno" | "bom";

export interface MentorFacts {
  /** Que eixo está mais em causa nesta semana. `null` quando não há sinal claro. */
  eixo: "crescimento" | "produtividade" | null;
  /** Leads novas registadas nos últimos 7 dias. */
  leadsSemana: number;
  /** Seguimentos com resultado registado nos últimos 7 dias. */
  seguimentosFechados: number;
  /** Negócios que mudaram de fase nos últimos 7 dias. */
  negociosMovidos: number;
  /** Quantos registos estão no mesmo estado da sugestão (ex. imóveis "por angariar"). */
  total: number;
  /** O caso da sugestão é o único naquele estado. */
  unicoNoEstado: boolean;
  /** Dias desde o último contacto real do caso mais parado. */
  diasSemContacto: number | null;
  /** O caso da sugestão não tem nenhum negócio ligado. */
  semNegocioLigado: boolean;
  /** Contexto de equipa do perfil ("sozinho", "equipa de 3"...). Ajusta o tom. */
  teamContext?: string | null;
}

export function emptyFacts(): MentorFacts {
  return {
    eixo: null,
    leadsSemana: 0,
    seguimentosFechados: 0,
    negociosMovidos: 0,
    total: 0,
    unicoNoEstado: false,
    diasSemContacto: null,
    semNegocioLigado: false,
    teamContext: null,
  };
}

/** Crescimento: entrada nova no funil esta semana. */
export function sinalCrescimento(f: MentorFacts): Sinal {
  if (f.leadsSemana <= 0) return "baixo";
  if (f.leadsSemana >= 2) return "bom";
  return "morno";
}

/** Produtividade: trabalho feito sobre o que já existe esta semana. */
export function sinalProdutividade(f: MentorFacts): Sinal {
  const movimento = f.seguimentosFechados + f.negociosMovidos;
  if (movimento <= 0) return "baixo";
  if (movimento >= 3) return "bom";
  return "morno";
}

function plural(n: number, um: string, muitos: string): string {
  return n === 1 ? `1 ${um}` : `${n} ${muitos}`;
}

/** Frase dos dois sinais, sempre a reconhecer o que houve. */
function fraseSinais(f: MentorFacts): string {
  const c = sinalCrescimento(f);
  const p = sinalProdutividade(f);
  const movimento = f.seguimentosFechados + f.negociosMovidos;

  const ladoC =
    c === "baixo"
      ? "esta semana o sinal é de baixo Crescimento — nenhuma lead nova registada"
      : c === "morno"
        ? "esta semana o Crescimento deu sinal de vida, com 1 lead nova"
        : `esta semana o Crescimento está a puxar, com ${f.leadsSemana} leads novas`;

  const ladoP =
    p === "baixo"
      ? "e a Produtividade também esteve parada, sem seguimentos fechados nem negócios a mexer"
      : p === "morno"
        ? `e a Produtividade foi contida: ${plural(movimento, "movimento registado", "movimentos registados")}`
        : `e a Produtividade está sólida: ${
            f.seguimentosFechados > 0
              ? plural(f.seguimentosFechados, "seguimento fechado", "seguimentos fechados")
              : ""
          }${f.seguimentosFechados > 0 && f.negociosMovidos > 0 ? " e " : ""}${
            f.negociosMovidos > 0
              ? plural(f.negociosMovidos, "negócio a avançar de fase", "negócios a avançar de fase")
              : ""
          }`;

  return `${ladoC.charAt(0).toUpperCase()}${ladoC.slice(1)}, ${ladoP}.`;
}

/**
 * Ligação explícita entre a sugestão principal (nível 1) e o sinal da semana.
 * Nunca repete os números já ditos no texto simples; diz para que serve agir.
 */
function fraseLigacao(f: MentorFacts, tipKey?: string): string {
  const c = sinalCrescimento(f);
  const p = sinalProdutividade(f);
  const acao =
    tipKey === "negocios-parados"
      ? "Desbloquear um destes negócios"
      : tipKey === "pessoas-frias"
        ? "Reativar uma destas pessoas"
        : tipKey === "imoveis-parados"
          ? "Retomar estes contactos"
          : "Agir sobre o que está aqui em cima";

  if (c === "baixo") {
    return `${acao} pode ser a tua entrada desta semana, sem precisares de começar do zero.`;
  }
  if (p === "baixo") {
    return `${acao} é a forma mais rápida de pôr a semana a mexer com o que já tens em mãos.`;
  }
  return `${acao} mantém os dois lados a puxar ao mesmo tempo — é isso que costuma sustentar o mês.`;
}

/**
 * Linha contextual do nível 2: **só a parte nova**. O texto simples já dá os
 * factos do caso (quantos, há quantos dias); aqui entra apenas a leitura da
 * semana (Crescimento/Produtividade) e a ligação à sugestão. Devolve `null`
 * quando não há nada de concreto a acrescentar.
 */
export function mentorContextLine(f: MentorFacts, tipKey?: string): string | null {
  return `${fraseSinais(f)} ${fraseLigacao(f, tipKey)}${teamTone(f)}`;
}

/**
 * Ajuste de tom pelo contexto de equipa (perfil "por gotas"). Uma frase curta,
 * nunca um motor de perfil. Sem contexto, nada muda.
 */
export function teamTone(f: MentorFacts): string {
  const t = String(f.teamContext ?? "").toLowerCase();
  if (!t) return "";
  if (/sozinh|s[óo]\b|individual|apenas eu/.test(t)) {
    return " Como estás sozinho, escolhe só uma frente e fecha-a bem.";
  }
  if (/equipa|team|s[óo]cio|parceir|coleg/.test(t)) {
    return " Com equipa contigo, vale a pena distribuir o que não precisa de ser teu.";
  }
  return "";
}

export interface MentorReinforcement {
  key: string;
  text: string;
  linkLabel: string;
  to: string;
  reason: string;
}

/**
 * Semana com os dois sinais bons e nenhum padrão a corrigir: o mentor reforça
 * em vez de ficar em silêncio. Só nível 2.
 */
export function mentorReinforcement(f: MentorFacts): MentorReinforcement | null {
  if (sinalCrescimento(f) !== "bom" || sinalProdutividade(f) !== "bom") return null;
  return {
    key: "semana-equilibrada",
    text: `Semana equilibrada: ${plural(f.leadsSemana, "lead nova", "leads novas")} de Crescimento e ${plural(
      f.seguimentosFechados + f.negociosMovidos,
      "movimento",
      "movimentos",
    )} de Produtividade. É este o ritmo que costuma sustentar o mês. Queres manter este ritmo na próxima semana?`,
    linkLabel: "Ver negócios →",
    to: "/negocios",
    reason:
      "leitura dos últimos 7 dias: leads novas registadas (Crescimento) e seguimentos fechados mais negócios a mudar de fase (Produtividade).",
  };
}

import { tierAtLeast } from "@/lib/subscription/tiers";

export interface LeveledTip {
  key: string;
  text: string;
  linkLabel: string;
  to: string;
  reason: string;
  facts?: MentorFacts;
  context?: string | null;
}

/**
 * Escolhe a profundidade da sugestão pelo plano. NÃO é um gate: Base continua
 * a ver o Mentor, só com o texto simples de sempre.
 *   base       → nível 1 (texto atual)
 *   consultor+ → nível 2 (texto atual + linha contextual; reforço em semana boa)
 */
export function applyMentorLevel(
  tip: LeveledTip | null,
  facts: MentorFacts,
  tier: string | null | undefined,
): LeveledTip | null {
  if (!tierAtLeast(tier, "consultor")) {
    return tip ? { ...tip, facts: undefined, context: null } : null;
  }
  if (tip) return { ...tip, facts, context: mentorContextLine(facts, tip.key) };
  const reforco = mentorReinforcement(facts);
  return reforco ? { ...reforco, facts, context: null } : null;
}