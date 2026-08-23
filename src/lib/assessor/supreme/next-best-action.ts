// PRÓXIMA MELHOR AÇÃO — NÍVEL 2 DE PRIORIDADE
//
// Módulo puro. Só entra em cena quando o nível 1 (`computePriorities`) está
// vazio: nada com prazo, nada a arder. Aqui vive o trabalho de fundo — o que
// tem sinal temporal mas nunca teve `due_at`: imóveis parados, negócios sem
// atividade, notas por tratar.
//
// Não é motor de ranking novo: recebe candidatos já apurados a partir das
// saídas do Detector de Oportunidades e das contagens canónicas, e decide
// apenas QUAL mostrar e COMO dizê-lo.
//
// Tom (decidido com o consultor):
//   C (padrão) — uma coisa só, nomeada, com motivo e tempo.
//   B (reserva) — quando o candidato não é individualizável (ex. "17 notas"),
//                 porque C com um agregado soa a inventário de dívida.
// Nunca cria urgência falsa: se não houver candidato, cala-se.

export type NbaKind = "imovel_parado" | "negocio_frio" | "diversos";

export interface NbaCandidate {
  /** Chave estável — é o que se guarda para saber o que foi sugerido ontem. */
  key: string;
  kind: NbaKind;
  /** Nome próprio do caso. `null` quando é agregado (força variante B). */
  label: string | null;
  /** O motivo, com tempo. Ex.: "parado há 22 dias, sem visitas". */
  reason: string;
  /** A ação sugerida — obrigatória, como no Detector. */
  action: string;
  /** Dias parados; desempata quando o valor é igual ou desconhecido. */
  days: number;
  /** Valor potencial em euros; `null` quando não há valor conhecido. */
  value: number | null;
  /** Onde se trata disto. */
  to: string;
  /** A ação implica falar com terceiros (proprietário, comprador, lead). */
  contactsThirdParty: boolean;
}

/** O que foi mostrado da última vez, para a regra de não-repetição. */
export interface NbaPrevious {
  key: string;
  /** O consultor clicou na sugestão (silêncio não conta como resolvido). */
  clicked: boolean;
}

export interface NbaSuggestion {
  key: string;
  kind: NbaKind;
  variant: "B" | "C";
  /** A frase completa a mostrar no painel. */
  text: string;
  action: string;
  to: string;
}

export interface NbaInput {
  candidates: NbaCandidate[];
  /** Sugestão do dia anterior, se existir. */
  previous?: NbaPrevious | null;
  /** Sábado ou domingo: tom mais leve e nunca contactar terceiros. */
  isWeekend?: boolean;
}

/** Fim de semana em Lisboa a partir do dia de calendário (YYYY-MM-DD). */
export function isWeekendYmd(ymd: string): boolean {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return false;
  const dia = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dia === 0 || dia === 6;
}

/** Dois candidatos valem o mesmo se ambos não têm valor ou ficam a <30% um do outro. */
export function comparableValue(a: NbaCandidate, b: NbaCandidate): boolean {
  if (a.value == null || b.value == null) return a.value == null && b.value == null;
  const alto = Math.max(a.value, b.value);
  const baixo = Math.min(a.value, b.value);
  if (alto <= 0) return true;
  return baixo / alto >= 0.7;
}

/** Valor potencial primeiro, depois dias parados, depois a chave (estável). */
export function sortCandidates(cands: NbaCandidate[]): NbaCandidate[] {
  return [...cands].sort((a, b) => {
    const va = a.value ?? -1;
    const vb = b.value ?? -1;
    if (va !== vb) return vb - va;
    if (a.days !== b.days) return b.days - a.days;
    return a.key.localeCompare(b.key);
  });
}

function compose(c: NbaCandidate, weekend: boolean): NbaSuggestion {
  const abertura = weekend ? "Fim de semana calmo." : "Não há nada a arder.";
  if (c.label) {
    return {
      key: c.key,
      kind: c.kind,
      variant: "C",
      text: `${abertura} Se tivesse de escolher uma coisa, era ${c.label} — ${c.reason}.`,
      action: c.action,
      to: c.to,
    };
  }
  // Variante B: sem nome próprio, oferece-se a escolha em vez de apontar um caso.
  return {
    key: c.key,
    kind: c.kind,
    variant: "B",
    text: `${abertura} Tens espaço para trabalho de fundo: ${c.reason}. Queres começar por aí?`,
    action: c.action,
    to: c.to,
  };
}

/**
 * Escolhe a próxima melhor ação. Devolve `null` quando não há candidato —
 * nesse caso o painel mantém a mensagem de "nada urgente", sem sugestão.
 */
export function selectNextBestAction(input: NbaInput): NbaSuggestion | null {
  const weekend = input.isWeekend === true;
  // Fim de semana: nada que envolva contactar terceiros.
  const elegiveis = input.candidates.filter((c) => !(weekend && c.contactsThirdParty));
  if (elegiveis.length === 0) return null;

  const ordenados = sortCandidates(elegiveis);
  const topo = ordenados[0]!;
  const previous = input.previous ?? null;

  // Regra de repetição: só alterna se houver alternativa de valor comparável.
  // Se o candidato parado é único, repete-se — silêncio não é "resolvido".
  if (previous && previous.key === topo.key && !previous.clicked) {
    const alternativa = ordenados.slice(1).find((c) => comparableValue(c, topo));
    if (alternativa) return compose(alternativa, weekend);
  }
  return compose(topo, weekend);
}
