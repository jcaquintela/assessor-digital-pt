import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  classifyTools,
  resolveOutcome,
  type ActionOutcome,
  type ClassifiedTool,
} from "./autonomy-classify";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data as any[]) ?? []).map((r) => r.role);
  if (!roles.includes("super_admin") && !roles.includes("support_admin")) {
    throw new Error("Forbidden: admin only");
  }
}

// Uma confirmação curta ("sim", "ok") significa que o motor PEDIU confirmação
// antes de executar — logo não é uma ação autónoma.
const CONFIRMATION_RE =
  /^\s*(sim|ok(ay|ei)?|claro|pode ser|est[áa] bem|confirma(r|do)?|faz isso|regista(r)?|com certeza|👍|✅)\s*[.!]?\s*$/i;

export type AutonomousAction = {
  traceId: string;
  createdAt: string;
  userId: string;
  consultant: string;
  autonomyLevel: string;
  channel: string;
  request: string;
  tools: string[];
  writeTools: string[];
  readTools: string[];
  ok: boolean;
  error: string | null;
  outcome: ActionOutcome;
  correctionCategory: string | null;
  correctionMessage: string | null;
  /** O texto do pedido só sai daqui com autorização viva do consultor. */
  contentVisible: boolean;
  contentBasis: "consent" | "synthetic" | "evaluation_program" | null;
  contentExpiresAt: string | null;
};

export type AutonomyCounters = {
  sucesso: number;
  falhou: number;
  corrigida: number;
  revertida: number;
  duplicada: number;
};

// Feed de ações executadas SEM pedir confirmação, por consultor.
// Só entram turnos com pelo menos uma ESCRITA: pesquisas são leitura e não
// contam como ação autónoma (contamos à parte, para transparência).
export const listAutonomousActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 14 * 864e5).toISOString();

    const { data: traceRows } = await supabaseAdmin
      .from("assessor_reasoning_traces")
      .select("id, created_at, user_id, channel, input_content, decision, tool_calls, error")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(400);

    const candidates = ((traceRows as any[]) ?? []).filter((t) => {
      const action = (t.decision as any)?.action;
      const tools = Array.isArray(t.tool_calls) ? t.tool_calls : [];
      if (action !== "act" || tools.length === 0) return false;
      return !CONFIRMATION_RE.test(String(t.input_content ?? ""));
    });

    const withTools = candidates.map((t) => ({ t, tools: classifyTools(t.tool_calls) }));
    const readOnlyTurns = withTools.filter((x) => !x.tools.some((c) => c.kind === "write")).length;
    const traces = withTools.filter((x) => x.tools.some((c) => c.kind === "write"));

    const empty: AutonomyCounters = { sucesso: 0, falhou: 0, corrigida: 0, revertida: 0, duplicada: 0 };
    if (traces.length === 0) {
      return { items: [] as AutonomousAction[], total: 0, readOnlyTurns, counters: empty };
    }

    const userIds = [...new Set(traces.map((x) => x.t.user_id).filter(Boolean))];
    const traceIds = traces.map((x) => x.t.id);

    const [{ data: profiles }, { data: prefs }, { data: corrections }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, name, email").in("id", userIds),
      supabaseAdmin.from("consultant_preferences").select("user_id, autonomy_level").in("user_id", userIds),
      supabaseAdmin
        .from("assistant_user_corrections")
        .select("turn_id, category, correction_message, created_at")
        .in("turn_id", traceIds),
    ]);

    // Uma escrita "revertida" é uma escrita cuja linha já não existe: o
    // consultor apagou o que o Assessor criou sozinho.
    const byTable = new Map<string, string[]>();
    for (const x of traces) {
      for (const c of x.tools) {
        if (c.kind === "write" && c.ok && c.entityId && c.table) {
          byTable.set(c.table, [...(byTable.get(c.table) ?? []), c.entityId]);
        }
      }
    }
    const alive = new Set<string>();
    await Promise.all(
      [...byTable.entries()].map(async ([table, ids]) => {
        const { data } = await supabaseAdmin.from(table as never).select("id").in("id", ids);
        for (const r of ((data as any[]) ?? [])) alive.add(String(r.id));
      }),
    );

    const profileById = new Map(((profiles as any[]) ?? []).map((p) => [p.id, p]));
    const autonomyById = new Map(((prefs as any[]) ?? []).map((p) => [p.user_id, p.autonomy_level]));
    const correctionByTrace = new Map(((corrections as any[]) ?? []).map((c) => [c.turn_id, c]));

    // Mesma regra de privacidade usada em Qualidade: sem consentimento vivo
    // (ou conta de teste / programa de avaliação / a própria conta do admin),
    // as palavras do consultor não são mostradas.
    const { buildContentAccessResolver, auditContentAccess } = await import("./consent.server");
    const resolveAccess = await buildContentAccessResolver(supabaseAdmin, {
      userIds,
      adminId: context.userId,
    });

    // Duplicado = a mesma escrita, do mesmo consultor, repetida em menos de
    // 5 minutos. Dois registos iguais são um incidente, não dois sucessos.
    const dupKeySeen = new Map<string, number>();
    const ordered = [...traces].sort(
      (a, b) => new Date(a.t.created_at).getTime() - new Date(b.t.created_at).getTime(),
    );
    const duplicateTraces = new Set<string>();
    for (const x of ordered) {
      const ts = new Date(x.t.created_at).getTime();
      for (const c of x.tools) {
        if (c.kind !== "write" || !c.ok) continue;
        const key = `${x.t.user_id}:${c.name}`;
        const prev = dupKeySeen.get(key);
        if (prev != null && ts - prev < 5 * 60_000) duplicateTraces.add(x.t.id);
        dupKeySeen.set(key, ts);
      }
    }

    const items: AutonomousAction[] = traces.map(({ t, tools }) => {
      const correction = correctionByTrace.get(t.id) ?? null;
      const p = profileById.get(t.user_id);
      const access = resolveAccess(t.user_id, t.id);
      const writes = tools.filter((c: ClassifiedTool) => c.kind === "write");
      const deleted = writes.some((c) => c.ok && c.entityId != null && !alive.has(c.entityId));
      const outcome = resolveOutcome({
        tools,
        traceError: t.error,
        hasCorrection: !!correction,
        deleted,
        duplicate: duplicateTraces.has(t.id),
      });
      return {
        traceId: t.id,
        createdAt: t.created_at,
        userId: t.user_id,
        consultant: p?.name || p?.email || String(t.user_id ?? "").slice(0, 8),
        autonomyLevel: autonomyById.get(t.user_id) ?? "equilibrado",
        channel: t.channel,
        request: access.allowed ? String(t.input_content ?? "").slice(0, 240) : "",
        contentVisible: access.allowed,
        contentBasis: access.basis,
        contentExpiresAt: access.expiresAt,
        tools: tools.map((c: ClassifiedTool) => c.name),
        writeTools: writes.map((c) => c.name),
        readTools: tools.filter((c: ClassifiedTool) => c.kind === "read").map((c) => c.name),
        ok: outcome === "sucesso",
        error: t.error ?? writes.find((c) => !c.ok)?.error ?? null,
        outcome,
        correctionCategory: correction?.category ?? null,
        correctionMessage: access.allowed ? (correction?.correction_message ?? null) : null,
      };
    });

    const counters: AutonomyCounters = { ...empty };
    for (const i of items) counters[i.outcome] += 1;

    const shown = items.slice(0, 100);

    // Toda a abertura de conteúdo real fica auditada, tal como em Qualidade.
    await Promise.all(
      shown
        .filter((i) => i.contentVisible && i.contentBasis === "consent")
        .map((i) =>
          auditContentAccess(supabaseAdmin, {
            adminId: context.userId,
            targetUserId: i.userId,
            resourceId: i.traceId,
            basis: i.contentBasis ?? "consent",
            consentId: null,
            reason: "Abertura de conteúdo em Ações autónomas",
          }),
        ),
    );

    return { items: shown, total: items.length, readOnlyTurns, counters };
  });
