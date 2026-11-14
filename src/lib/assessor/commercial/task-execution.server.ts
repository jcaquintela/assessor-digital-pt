// Execução assistida: grava nos Seguimentos as tarefas que o Afonso acabou de
// propor — SÓ quando o consultor diz explicitamente "cria as tarefas".
//
// As tarefas são recalculadas de forma determinística a partir das mesmas
// mensagens e do mesmo momento da resposta, por isso grava-se exatamente o que
// foi mostrado. Idempotente: tarefas já gravadas (mesmo título e dia) não se
// duplicam. Só escreve através do serviço de domínio (create_follow_up).

import { isAccountFlagEnabled } from "@/lib/flags/account-flag.server";
import { ACTION_FIRST_FLAG, CONTINUATION_WINDOW_MS } from "../qualification/qualification.server";
import { briefFromMessages, isBuyerQualification } from "../qualification/buyer-brief";
import { isQualificationReply } from "../qualification/compose";
import { buyerPlan } from "../qualification/buyer-plan";
import { isListingReply } from "../listing/compose";
import { extractListingBrief, isListingDiagnosis, mergeListingBriefs } from "../listing/listing-brief";
import { listingPlan } from "../listing/listing-plan";
import { checkPrice, readFunnel } from "../listing/diagnosis";
import { isDealReply } from "../deal/compose";
import { dealBriefFromMessages } from "../deal/deal.server";
import { dealPlan } from "../deal/deal-plan";
import { isCreateTasksCommand, type PreparedTask } from "./assisted-execution";
import { formatActionStates } from "./action-states";

export interface TaskExecDeps {
  loadRecent(): Promise<Array<{ role: string; content: string; created_at: string }>>;
  existingTitles(dueYmds: string[]): Promise<Set<string>>;
  createFollowUp(t: PreparedTask): Promise<{ ok: boolean; created: boolean; error?: string }>;
}

const key = (t: { title: string; dueYmd: string }) => `${t.dueYmd}|${t.title}`;

export function defaultTaskExecDeps(supabase: any, userId: string, channel: string): TaskExecDeps {
  return {
    async loadRecent() {
      const since = new Date(Date.now() - CONTINUATION_WINDOW_MS).toISOString();
      const { data } = await supabase.from("assessor_messages").select("role, content, created_at")
        .eq("user_id", userId).eq("channel", channel).gte("created_at", since)
        .order("created_at", { ascending: false }).limit(30);
      return ((data ?? []) as any[]).reverse();
    },
    async existingTitles(dueYmds) {
      const since = new Date(Date.now() - 3 * 86400_000).toISOString();
      const { data } = await supabase.from("follow_ups").select("title, due_date")
        .eq("user_id", userId).is("archived_at", null).gte("created_at", since).limit(200);
      const out = new Set<string>();
      const { lisbonYmd } = await import("../lisbon-day");
      for (const r of (data ?? []) as any[]) {
        const ymd = lisbonYmd(r.due_date);
        if (dueYmds.includes(ymd)) out.add(`${ymd}|${r.title}`);
      }
      return out;
    },
    async createFollowUp(t) {
      const { dispatchToolCall } = await import("../v2/domain.server");
      const r = await dispatchToolCall(
        { supabase, userId, channel, skipPersonResolution: true, skipPropertyResolution: true, skipDuplicateCheck: true },
        "create_follow_up",
        JSON.stringify({ title: t.title, type: "tarefa", due_date: t.dueYmd, priority: t.priority, notes: "Criada a teu pedido a partir da proposta do Afonso." }),
      );
      const { isRealWrite } = await import("../v3/write-receipt");
      return { ok: r.ok, created: isRealWrite({ name: "create_follow_up", ok: r.ok, data: r.data }), error: r.error };
    },
  };
}

/** Recalcula as tarefas da última proposta comercial (null se não houver). */
export function tasksFromConversation(
  recent: Array<{ role: string; content: string; created_at: string }>,
  now: Date,
): { tasks: PreparedTask[]; anchor: Date } | null {
  let idx = -1;
  for (let i = recent.length - 1; i >= 0; i--) {
    const r = recent[i]!;
    if (r.role !== "assistant") continue;
    if (isQualificationReply(r.content) || isListingReply(r.content) || isDealReply(r.content)) { idx = i; break; }
  }
  if (idx < 0) return null;
  const reply = recent[idx]!;
  const anchor = new Date(reply.created_at);
  if (now.getTime() - anchor.getTime() > CONTINUATION_WINDOW_MS) return null;
  const users = recent.slice(0, idx).filter((r) => r.role === "user").map((r) => String(r.content ?? ""));
  if (isDealReply(reply.content)) return { tasks: dealPlan(dealBriefFromMessages(users, anchor), anchor).tasks, anchor };
  if (isListingReply(reply.content)) {
    const first = Math.max(0, users.findIndex((u) => isListingDiagnosis(u)));
    const b = mergeListingBriefs(users.slice(first).map(extractListingBrief));
    const f = readFunnel(b);
    return { tasks: listingPlan(b, anchor, { breakAt: f.breakAt, discrepancy: checkPrice(b).discrepancy, demandProblem: f.demandProblem }).tasks, anchor };
  }
  const first = Math.max(0, users.findIndex((u) => isBuyerQualification(u)));
  const { brief } = briefFromMessages(users.slice(first), anchor);
  return { tasks: buyerPlan(brief, anchor, { hasProposals: true }).tasks, anchor };
}

export async function runCreateTasks(params: {
  supabase: any; userId: string; channel: string; trimmed: string; now?: Date; deps?: TaskExecDeps; skipFlagCheck?: boolean;
}): Promise<{ reply: string; created: number } | null> {
  const { supabase, userId, channel, trimmed } = params;
  if (!isCreateTasksCommand(trimmed)) return null;
  if (!params.skipFlagCheck && !(await isAccountFlagEnabled(supabase, ACTION_FIRST_FLAG, userId))) return null;
  const now = params.now ?? new Date();
  const deps = params.deps ?? defaultTaskExecDeps(supabase, userId, channel);
  const found = tasksFromConversation(await deps.loadRecent(), now);
  if (!found || !found.tasks.length) return null;

  const existing = await deps.existingTitles(found.tasks.map((t) => t.dueYmd)).catch(() => new Set<string>());
  const created: PreparedTask[] = [];
  const already: PreparedTask[] = [];
  const failed: PreparedTask[] = [];
  for (const t of found.tasks) {
    if (existing.has(key(t))) { already.push(t); continue; }
    const r = await deps.createFollowUp(t).catch(() => ({ ok: false, created: false }));
    (r.ok && r.created ? created : failed).push(t);
  }
  const dd = (y: string) => `${y.slice(8, 10)}/${y.slice(5, 7)}`;
  const parts: string[] = [];
  if (created.length) parts.push(`Gravei ${created.length} ${created.length === 1 ? "tarefa" : "tarefas"} nos teus Seguimentos:\n${created.map((t) => `- ${dd(t.dueYmd)}: ${t.title}`).join("\n")}`);
  if (already.length) parts.push(`Já lá estavam (não dupliquei): ${already.map((t) => t.title).join("; ")}.`);
  if (failed.length) parts.push(`Não consegui gravar: ${failed.map((t) => t.title).join("; ")} — ficou como estava. Diz-me "cria as tarefas" outra vez e eu tento de novo.`);
  parts.push(formatActionStates([
    ...(created.length ? [{ state: "executed" as const, evidenceTool: "create_follow_up", text: `${created.length} ${created.length === 1 ? "tarefa gravada" : "tarefas gravadas"} nos Seguimentos` }] : []),
    { state: "awaiting_approval", text: "mensagens a terceiros continuam contigo — nada sai sem o teu ok" },
  ]));
  return { reply: parts.join("\n\n"), created: created.length };
}
