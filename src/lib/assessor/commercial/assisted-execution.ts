// Execução assistida (pura): mensagens e tarefas entregues já prontas.
// Mensagens: PREPARADO — o consultor copia e envia; o Afonso não envia nada
// a terceiros. Tarefas: PENDENTE até o consultor dizer "cria as tarefas";
// só então passam a EXECUTADO, com o resultado real da gravação.

import { ddmmLisbon } from "./next-best-action";

export interface PreparedMessage { to: string; text: string }
export interface PreparedTask { title: string; dueYmd: string; owner: string; priority: "alta" | "media" | "baixa" }

export const CREATE_TASKS_HINT = 'diz "cria as tarefas" e ficam nos teus Seguimentos';

export function formatMessages(list: PreparedMessage[]): string | null {
  if (!list.length) return null;
  return list.map((m) => `*Mensagem para ${m.to} (preparada — copias e envias tu):*\n"${m.text}"`).join("\n\n");
}

const ymdToDdmm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

export function formatTasks(list: PreparedTask[]): string | null {
  if (!list.length) return null;
  return [`*Tarefas prontas (pendentes — ${CREATE_TASKS_HINT}):*`, ...list.map((t) => `- ${ymdToDdmm(t.dueYmd)} · ${t.owner}: ${t.title}`)].join("\n");
}

const CREATE_RE =
  /^\s*(?:sim[,!.]?\s*)?(?:podes\s+)?(?:cria|criar|crias|marca|marcar|regista|registar|guarda|guardar)\s+(?:(?:as|os|essas|esses|estas|estes)\s+)?(?:tarefas|seguimentos)\b/i;

/** O consultor autoriza explicitamente gravar as tarefas propostas? */
export function isCreateTasksCommand(text: string): boolean {
  return CREATE_RE.test(String(text ?? ""));
}

export { ddmmLisbon };
