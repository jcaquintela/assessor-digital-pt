// FONTE ÚNICA dos termos de classificação de compromissos.
//
// Dois classificadores com propósitos diferentes leem daqui:
//   - `src/lib/assessor/event-class.ts` — binário 'negocio' vs 'interno'
//     (decide se pede "Como correu?" e se conta como seguimento em atraso).
//   - `src/lib/agenda/event-category.ts` — taxonomia da Agenda Inteligente
//     (Visitas, Operação, Formação, Pessoal, Suporte, Aniversários).
//
// Antes, cada ficheiro tinha a sua lista e já divergiam: "closing", "ops",
// "kick off", "pipeline", "forecast", "recrutamento" e "entrevista" eram
// internos num lado e comerciais no outro. Resultado: "Entrevista de
// recrutamento" ligada a uma pessoa aparecia em Operação & Liderança na Agenda
// mas disparava "Como correu?" e entrava em "Aguardam resultado".
//
// Regra: só se acrescentam termos AQUI. Quem quer decidir "isto é interno?"
// usa `INTERNAL_TITLE_TERMS`; quem quer a família usa o grupo respectivo.

/** Aniversários — séries recorrentes importadas, dominam a agenda. */
export const BIRTHDAY_TERMS: readonly string[] = [
  "aniversario", "birthday", "anniversary", "parabens", "b-day",
];

/** Núcleo comercial: visitas, angariação, negociação com cliente. */
export const VISIT_TERMS: readonly string[] = [
  "visita", "revisita", "angariacao", "angariar", "avaliacao", "avaliar imovel",
  "cpcv", "escritura", "promessa", "proposta", "chaves", "entrega de chaves",
  "reuniao com proprietario", "captacao", "open house", "prospecao", "placa",
];

/** Operação & Liderança — reuniões internas de equipa e gestão. */
export const OPERATION_TERMS: readonly string[] = [
  "equipa", "team", "team building", "level up",
  "closing", "weekly", "ops", "operacoes", "operacional",
  "lideranca", "direcao",
  "interno", "interna", "internos", "internas",
  "1:1", "1-1", "one on one", "one-on-one",
  "daily", "standup", "stand up",
  "alinhamento", "briefing interno", "kick off", "kickoff", "kick off interno",
  "reuniao geral", "plenario",
  "pipeline", "forecast", "recrutamento", "entrevista",
];

/** Formação & Eventos (internos ou de indústria, nunca resultado comercial). */
export const TRAINING_TERMS: readonly string[] = [
  "academia", "formacao", "formacao interna", "onboarding interno",
  "curso", "workshop", "webinar", "masterclass",
  "conferencia", "congresso", "summit", "convencao", "seminario", "bootcamp",
  "certificacao", "evento", "gala", "save the date", "networking",
  "kick-off anual",
];

/** Pessoal & Saúde. */
export const PERSONAL_TERMS: readonly string[] = [
  "treino", "ginasio", "medico", "dentista", "consulta", "analises", "fisioterapia",
  "ferias", "familia", "almoco em familia", "escola", "aniversario de casamento",
  "pessoal", "folga", "viagem pessoal", "psicologo", "vacina",
];

/** Suporte & Administrativo. */
export const ADMIN_TERMS: readonly string[] = [
  "piquete", "informatica", "it ", "suporte", "helpdesk",
  "administrativo", "administrativa", "backoffice", "back office",
  "contabilidade", "faturacao", "financas", "banco", "seguros",
  "juridico", "advogado", "notario", "cartorio",
  "renovacao", "licenca", "manutencao",
];

/**
 * Todos os termos que, por si só, marcam um compromisso como interno — isto é,
 * nunca pedem resultado comercial. É a lista que `event-class.ts` consome.
 */
export const INTERNAL_TITLE_TERMS: readonly string[] = [
  ...OPERATION_TERMS,
  ...TRAINING_TERMS,
  ...PERSONAL_TERMS,
  ...ADMIN_TERMS,
];

/** Famílias da Agenda que NUNCA são trabalho comercial de resultado. */
export const INTERNAL_CATEGORY_KEYS: readonly string[] = [
  "operacao", "formacao", "pessoal", "suporte", "aniversarios",
];
