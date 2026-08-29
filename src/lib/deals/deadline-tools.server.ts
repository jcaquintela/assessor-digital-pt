// Ferramentas v3 de Prazos de negócio — Domain Services.
//
// Regra de ouro: a IA nunca escreve sem confirmação explícita. Estes
// executores só correm depois do "sim" do consultor (pending action), e a
// correção de data passa pelo mesmo rigor de `reschedule-intent`: uma frase
// de esclarecimento nunca atualiza nada em silêncio.

import { z } from "zod";
import { readRescheduleIntent } from "@/lib/agenda/reschedule-intent";
import { lisbonYmd } from "@/lib/assessor/lisbon-day";
import {
  AddDealDeadlineArgs,
  CancelDealDeadlineArgs,
  CompleteDealDeadlineArgs,
  ListDealDeadlinesArgs,
} from "@/lib/assessor/v2/tools";
import {
  daysUntilDeadline,
  deadlineWhen,
  parseNoticeDays,
} from "./deadlines";
import {
  addDeadline,
  listDeadlines,
  setDeadlineStatus,
  updateDeadlineDate,
} from "./deadlines.server";
import { dealResolutionQuestion, resolveDealForWrite } from "./resolve-deal.server";

interface Ctx {
  supabase: any;
  userId: string;
  sourceMessageId?: string | null;
  focusDealId?: string | null;
  personId?: string | null;
  propertyId?: string | null;
}

type Result = { ok: boolean; data?: unknown; error?: string };

const ok = (data?: unknown): Result => ({ ok: true, data });
const fail = (error: string): Result => ({ ok: false, error });

function parse<T extends z.ZodTypeAny>(schema: T, args: unknown) {
  const r = schema.safeParse(args);
  return r.success
    ? ({ ok: true, value: r.data as z.infer<T> } as const)
    : ({ ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } as const);
}

export async function execAddDealDeadline(ctx: Ctx, args: unknown): Promise<Result> {
  const p = parse(AddDealDeadlineArgs, args);
  if (!p.ok) return fail(p.error);
  const v = p.value;

  let dealId = v.opportunity_id ?? null;
  if (!dealId) {
    const res = await resolveDealForWrite(
      {
        supabase: ctx.supabase,
        userId: ctx.userId,
        focusDealId: ctx.focusDealId ?? null,
        personId: ctx.personId ?? null,
        propertyId: ctx.propertyId ?? null,
      },
      v.deal_hint ?? v.label ?? "",
    );
    if (res.status !== "linked") {
      return ok({
        needs_resolution: true,
        resolution: res,
        question: dealResolutionQuestion(res),
      });
    }
    dealId = res.dealId;
  }

  const noticeDays = v.notice_days ?? parseNoticeDays(v.deal_hint ?? "") ?? null;
  const created = await addDeadline(ctx.supabase, ctx.userId, {
    opportunityId: dealId!,
    label: v.label,
    dueDate: v.due_date,
    noticeDays,
    notes: v.notes ?? null,
  });
  const daysLeft = daysUntilDeadline(v.due_date, lisbonYmd(new Date()));
  return ok({ id: created.id, opportunity_id: dealId, label: v.label, due_date: v.due_date, when: deadlineWhen(daysLeft) });
}

export async function execListDealDeadlines(ctx: Ctx, args: unknown): Promise<Result> {
  const p = parse(ListDealDeadlinesArgs, args);
  if (!p.ok) return fail(p.error);
  const rows = await listDeadlines(ctx.supabase, ctx.userId, {
    opportunityId: p.value.opportunity_id ?? null,
    includeClosed: p.value.include_closed ?? false,
  });
  const today = lisbonYmd(new Date());
  return ok({
    deadlines: rows.map((r) => ({
      id: r.id,
      label: r.label,
      due_date: r.due_date,
      status: r.status ?? "aberto",
      deal_label: r.deal_label,
      when: deadlineWhen(daysUntilDeadline(String(r.due_date).slice(0, 10), today)),
    })),
  });
}

export async function execCompleteDealDeadline(ctx: Ctx, args: unknown): Promise<Result> {
  const p = parse(CompleteDealDeadlineArgs, args);
  if (!p.ok) return fail(p.error);
  await setDeadlineStatus(ctx.supabase, ctx.userId, p.value.deadline_id, "cumprido");
  return ok({ id: p.value.deadline_id, status: "cumprido" });
}

export async function execCancelDealDeadline(ctx: Ctx, args: unknown): Promise<Result> {
  const p = parse(CancelDealDeadlineArgs, args);
  if (!p.ok) return fail(p.error);
  await setDeadlineStatus(ctx.supabase, ctx.userId, p.value.deadline_id, "cancelado");
  return ok({ id: p.value.deadline_id, status: "cancelado" });
}

/**
 * Correção de data de um prazo já registado ("a escritura afinal é dia 20").
 * Sem verbo explícito de mudança, isto é um esclarecimento: pedimos
 * confirmação e não escrevemos. Mesmo rigor da agenda.
 */
export async function applyDeadlineDateCorrection(
  ctx: Ctx,
  input: { deadlineId: string; newDate: string; utterance: string; confirmed?: boolean },
): Promise<{ written: boolean; question?: string }> {
  const intent = readRescheduleIntent(input.utterance);
  if (!input.confirmed && !intent.explicitReschedule) {
    return {
      written: false,
      question: `Queres que passe esse prazo para ${input.newDate}? Só mudo depois de confirmares.`,
    };
  }
  await updateDeadlineDate(ctx.supabase, ctx.userId, input.deadlineId, input.newDate);
  return { written: true };
}
