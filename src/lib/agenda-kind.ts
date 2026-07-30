// Classificação partilhada: um registo de `follow_ups` é um compromisso de
// agenda (Evento) ou uma tarefa/seguimento.
//
// Contexto: `create_event` grava em `follow_ups` com `type` = tipo do evento
// ("visita", "reuniao_angariacao", ...), enquanto registos antigos usam
// "Evento"/"event". Sem esta normalização, um compromisso criado por voz não
// aparecia em /calendario.

const EVENT_TYPES = new Set([
  "evento", "event", "visita", "visit", "viewing",
  "reuniao", "reuniao_angariacao", "meeting", "angariacao",
  "almoco", "jantar", "cafe", "encontro",
]);

const TASK_TYPES = new Set(["tarefa", "task", "todo", "email", "mensagem", "sms", "chamada", "call", "phone_call", "lembrete", "outro"]);

function norm(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * É um compromisso de agenda quando o tipo é claramente de evento, ou quando
 * tem hora específica marcada e não é uma tarefa solta (ex.: "reunião amanhã
 * às 9:30" → Evento; "ligar ao Paulo amanhã" → Tarefa).
 */
export function isAgendaEvent(type: unknown, dueTime?: unknown): boolean {
  const t = norm(type);
  if (EVENT_TYPES.has(t)) return true;
  if (TASK_TYPES.has(t)) return false;
  return !!String(dueTime ?? "").trim();
}
