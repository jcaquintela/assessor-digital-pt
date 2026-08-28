// Métricas do aviso de transição e da pergunta de zona (perfil por gotas).
// Módulo puro: quem lê a base de dados é ./profile-drip-metrics.server.ts.

/** Consultor a usar o Afonso há mais de uma semana → elegível ao aviso. */
export const EXISTING_AFTER_MS = 7 * 864e5;

export interface DripProfileRow {
  id: string;
  created_at: string | null;
  work_area: string | null;
  team_context: string | null;
  profile_questions_asked: unknown;
  profile_notice_sent_at: string | null;
  profile_paused_until: string | null;
}

export interface DripMetrics {
  /** Consultores no total (com perfil). */
  total: number;
  /** Contas com mais de 7 dias: universo do aviso de transição. */
  existentes: number;
  /** Existentes que ainda não receberam o aviso e continuam à espera. */
  elegiveis: number;
  /** Já receberam o aviso (profile_notice_sent_at preenchido). */
  receberam: number;
  /** Em pausa por recusas seguidas. */
  emPausa: number;
  /** Perguntas de zona feitas. */
  zonaPerguntada: number;
  /** Zonas efetivamente preenchidas depois da pergunta. */
  zonaRespondida: number;
  /** Percentagem de respostas à pergunta de zona (0-100, null sem perguntas). */
  taxaResposta: number | null;
  /** Contexto de equipa preenchido. */
  equipaRespondida: number;
}

function askedKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => (a && typeof a === "object" ? String((a as any).key ?? "") : ""))
    .filter(Boolean);
}

export function computeDripMetrics(
  rows: DripProfileRow[],
  now: Date = new Date(),
): DripMetrics {
  const t = now.getTime();
  let existentes = 0;
  let elegiveis = 0;
  let receberam = 0;
  let emPausa = 0;
  let zonaPerguntada = 0;
  let zonaRespondida = 0;
  let equipaRespondida = 0;

  for (const r of rows) {
    const created = r.created_at ? new Date(r.created_at).getTime() : NaN;
    const existente = Number.isFinite(created) && t - created > EXISTING_AFTER_MS;
    if (existente) existentes += 1;

    const keys = askedKeys(r.profile_questions_asked);
    const perguntouZona = keys.includes("work_area");
    if (perguntouZona) {
      zonaPerguntada += 1;
      if (r.work_area) zonaRespondida += 1;
    }
    if (r.team_context) equipaRespondida += 1;

    if (r.profile_notice_sent_at) receberam += 1;
    else if (existente) elegiveis += 1;

    const pausa = r.profile_paused_until ? new Date(r.profile_paused_until).getTime() : NaN;
    if (Number.isFinite(pausa) && pausa > t) emPausa += 1;
  }

  return {
    total: rows.length,
    existentes,
    elegiveis,
    receberam,
    emPausa,
    zonaPerguntada,
    zonaRespondida,
    taxaResposta: zonaPerguntada ? Math.round((zonaRespondida / zonaPerguntada) * 100) : null,
    equipaRespondida,
  };
}
