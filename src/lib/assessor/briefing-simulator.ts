// Modo de simulação: dado um compromisso hipotético, diz se entra ou sai do
// briefing / agenda do dia — e porquê. Módulo PURO: não lê nem escreve na BD.
//
// Reproduz, pela mesma ordem, as regras aplicadas em
// `supreme/priorities.server.ts` (agenda do dia) e `supreme/briefing.server.ts`
// (pré-evento), mais o filtro estrito dos check-ins "Como correu X?".

import { isFollowUpClosed, isFollowUpOpen } from "@/lib/follow-ups/state";
import { isFollowUpEvent } from "@/lib/follow-ups/state";
import { belongsInDailyAgenda, isLeisureTitle } from "./agenda-leisure";
import { hasCommercialOutcomeContext } from "./outcome-eligibility";
import { isEventOver } from "./supreme/event-window";
import { lisbonYmd, ymdDiffDays } from "./lisbon-day";

export interface SimulatedItem {
  title?: string | null;
  /** Dia de calendário "YYYY-MM-DD" (ou ISO completo). */
  due_date?: string | null;
  /** Hora "HH:MM" — sem hora é tratado como tarefa/dia inteiro. */
  due_time?: string | null;
  type?: string | null;
  status?: string | null;
  outcome?: string | null;
  archived_at?: string | null;
  person_id?: string | null;
  related_property_id?: string | null;
  opportunity_id?: string | null;
  /** Veio de um calendário externo (Google/Outlook)? */
  from_calendar?: boolean;
}

export interface SimulationStep {
  rule: string;
  passed: boolean;
  detail: string;
}

export interface SimulationResult {
  inAgenda: boolean;
  generatesCheckIn: boolean;
  isEvent: boolean;
  isLeisure: boolean;
  steps: SimulationStep[];
  verdict: string;
}

export function simulateBriefing(item: SimulatedItem, now: Date = new Date()): SimulationResult {
  const steps: SimulationStep[] = [];
  const isEvent = isFollowUpEvent(item);
  const leisure = isLeisureTitle(item.title);
  const hasContext = hasCommercialOutcomeContext(item);
  const fromCalendar = Boolean(item.from_calendar);

  const todayYmd = lisbonYmd(now);
  const dueYmd = item.due_date ? lisbonYmd(item.due_date) : "";
  const overdueDays = dueYmd ? Math.max(0, ymdDiffDays(todayYmd, dueYmd)) : 0;

  let inAgenda = true;
  const stop = (rule: string, detail: string) => {
    steps.push({ rule, passed: false, detail });
    inAgenda = false;
  };

  // 1. Estado canónico
  if (isFollowUpClosed(item)) {
    stop("Estado aberto", "Fechado (arquivado, resultado terminal ou estado concluído).");
  } else {
    steps.push({ rule: "Estado aberto", passed: true, detail: "Aberto pela regra canónica." });
  }

  // 2. Deny-list de lazer (só se aplica a compromissos de calendário externo)
  if (inAgenda) {
    if (fromCalendar && !belongsInDailyAgenda(item)) {
      stop("Não é lazer", "Título de lazer/pessoal e sem ligação a Pessoa, Imóvel ou Negócio.");
    } else {
      steps.push({
        rule: "Não é lazer",
        passed: true,
        detail: !fromCalendar
          ? "Criado no Afonso (a deny-list só filtra eventos de calendário externo)."
          : leisure
            ? "Título de lazer, mas ligado a uma entidade — conta como trabalho."
            : "Título de trabalho.",
      });
    }
  }

  // 3. Compromisso já terminou
  if (inAgenda) {
    if (isEvent && isEventOver(item, now)) {
      stop("Ainda por acontecer", "O compromisso já terminou — não se prepara o que já passou.");
    } else {
      steps.push({
        rule: "Ainda por acontecer",
        passed: true,
        detail: isEvent ? "Compromisso ainda não terminou." : "Tarefa (sem janela horária).",
      });
    }
  }

  // 4. Evento externo atrasado não se arrasta
  if (inAgenda) {
    if (fromCalendar && overdueDays > 0) {
      stop("Não é evento externo atrasado", `Evento de calendário com ${overdueDays} dia(s) de atraso.`);
    } else {
      steps.push({
        rule: "Não é evento externo atrasado",
        passed: true,
        detail: overdueDays > 0 ? `Atrasado há ${overdueDays} dia(s), mas criado no Afonso.` : "Sem atraso.",
      });
    }
  }

  const generatesCheckIn = isFollowUpOpen(item) && isEvent && hasContext;

  return {
    inAgenda,
    generatesCheckIn,
    isEvent,
    isLeisure: leisure,
    steps,
    verdict: inAgenda
      ? `Entra na agenda do dia${generatesCheckIn ? " e gera check-in \"Como correu?\"" : " (sem check-in)"}.`
      : `Fica fora do briefing: ${steps.find((s) => !s.passed)?.detail ?? ""}`,
  };
}
