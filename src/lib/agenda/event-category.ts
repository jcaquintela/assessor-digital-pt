// Agenda Inteligente — categoria automática de compromissos.
//
// Mesmo padrão já validado no Drive Inteligente (`src/lib/drive/system-category.ts`):
// função pura, regras determinísticas (sem IA por evento — latência e custo zero
// mesmo em sincronizações de milhares de eventos) e nunca devolve null.
//
// A categoria manual do consultor (`follow_ups.event_category_id`) manda sempre:
// esta função só decide a categoria automática (`follow_ups.event_category`).

export type EventCategoryKey =
  | "visitas"
  | "operacao"
  | "formacao"
  | "aniversarios"
  | "pessoal"
  | "suporte"
  | "por_classificar";

export const EVENT_CATEGORY_LABEL: Record<EventCategoryKey, string> = {
  visitas: "Visitas & Angariação",
  operacao: "Operação & Liderança",
  formacao: "Formação & Eventos",
  aniversarios: "Aniversários",
  pessoal: "Pessoal & Saúde",
  suporte: "Suporte & Administrativo",
  por_classificar: "Por classificar",
};

/** Rótulo curto para chips de filtro. */
export const EVENT_CATEGORY_SHORT: Record<EventCategoryKey, string> = {
  visitas: "Visitas",
  operacao: "Operação",
  formacao: "Formação",
  aniversarios: "Aniversários",
  pessoal: "Pessoal",
  suporte: "Suporte",
  por_classificar: "Por classificar",
};

/** Ordem estável na vista por categoria. */
export const EVENT_CATEGORY_ORDER: EventCategoryKey[] = [
  "visitas",
  "operacao",
  "formacao",
  "pessoal",
  "suporte",
  "por_classificar",
  "aniversarios",
];

/**
 * Categorias escondidas por defeito na UI. Os aniversários são 213 registos
 * (9 séries recorrentes) nesta conta: se aparecessem por omissão, esmagavam
 * tudo o resto. Só surgem depois de o consultor os activar explicitamente.
 */
export const HIDDEN_BY_DEFAULT: EventCategoryKey[] = ["aniversarios"];

export function eventCategoryLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return EVENT_CATEGORY_LABEL[key as EventCategoryKey] ?? null;
}

function norm(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const has = (t: string, terms: string[]) => terms.some((w) => t.includes(w));

export interface EventCategoryCandidate {
  title?: string | null;
  /** `follow_ups.type` (evento, visita, tarefa, ...). */
  type?: string | null;
  person_id?: string | null;
  related_property_id?: string | null;
  related_prospecting_lead_id?: string | null;
  opportunity_id?: string | null;
  notes?: string | null;
}

/**
 * Categoria automática de um compromisso. Nunca devolve null: sem sinais
 * suficientes cai em "por_classificar" (visível e destacado na UI, ao
 * contrário do "outros" do Drive, que é um saco silencioso).
 */
export function eventCategoryFor(item: EventCategoryCandidate): EventCategoryKey {
  const t = norm(item.title);
  const type = norm(item.type);

  // 1. Aniversários — séries recorrentes importadas, dominam a agenda.
  if (has(t, ["aniversario", "birthday", "anniversary", "parabens", "b-day"])) {
    return "aniversarios";
  }

  // 2. Visitas & Angariação — o núcleo comercial.
  if (
    type === "visita" ||
    has(t, [
      "visita", "revisita", "angariacao", "angariar", "avaliacao", "avaliar imovel",
      "cpcv", "escritura", "promessa", "proposta", "chaves", "entrega de chaves",
      "reuniao com proprietario", "captacao", "open house", "prospecao", "placa",
    ])
  ) {
    return "visitas";
  }

  // 3. Operação & Liderança — reuniões internas de equipa e gestão.
  if (
    has(t, [
      "closing", "weekly", "ops", "operacoes", "operacional", "equipa", "team",
      "lideranca", "direcao", "1:1", "1-1", "one on one", "daily", "standup",
      "stand up", "alinhamento", "kick off", "kickoff", "reuniao geral",
      "plenario", "level up", "pipeline", "forecast", "recrutamento", "entrevista",
    ])
  ) {
    return "operacao";
  }

  // 4. Formação & Eventos.
  if (
    has(t, [
      "academia", "formacao", "curso", "workshop", "webinar", "masterclass",
      "conferencia", "congresso", "summit", "convencao", "seminario", "bootcamp",
      "certificacao", "evento", "gala", "save the date", "networking", "kick-off anual",
    ])
  ) {
    return "formacao";
  }

  // 5. Pessoal & Saúde.
  if (
    has(t, [
      "treino", "ginasio", "medico", "dentista", "consulta", "analises", "fisioterapia",
      "ferias", "familia", "almoco em familia", "escola", "aniversario de casamento",
      "pessoal", "folga", "viagem pessoal", "psicologo", "vacina",
    ])
  ) {
    return "pessoal";
  }

  // 6. Suporte & Administrativo.
  if (
    has(t, [
      "piquete", "informatica", "it ", "suporte", "helpdesk", "administrativo",
      "administrativa", "backoffice", "back office", "contabilidade", "faturacao",
      "financas", "banco", "seguros", "juridico", "advogado", "notario", "cartorio",
      "renovacao", "licenca", "manutencao",
    ])
  ) {
    return "suporte";
  }

  // 7. Sinais estruturais: sem palavras-chave, um compromisso ligado a
  // pessoa/imóvel/negócio/lead é trabalho comercial.
  if (
    item.related_property_id ||
    item.related_prospecting_lead_id ||
    item.opportunity_id ||
    item.person_id
  ) {
    return "visitas";
  }

  return "por_classificar";
}

/**
 * Categoria a gravar quando o compromisso NASCE (conversa, dashboard ou
 * importação Google/Outlook). Nunca sobrepõe nada: quem chama só a usa em
 * registos sem categoria automática ainda atribuída.
 */
export function initialEventCategory(item: EventCategoryCandidate): EventCategoryKey {
  return eventCategoryFor(item);
}

/**
 * Categoria efectiva de um registo: a manual do consultor manda sempre sobre a
 * automática (mesma convenção do Drive). Devolve a chave da categoria e se é
 * automática, para a UI marcar o hint "automática".
 */
export function effectiveEventCategory(row: {
  event_category?: string | null;
  event_category_id?: string | null;
}): { key: string; automatica: boolean } {
  if (row.event_category_id) return { key: row.event_category_id, automatica: false };
  const auto = (row.event_category ?? "") as EventCategoryKey;
  return {
    key: `sys:${EVENT_CATEGORY_LABEL[auto] ? auto : "por_classificar"}`,
    automatica: true,
  };
}
