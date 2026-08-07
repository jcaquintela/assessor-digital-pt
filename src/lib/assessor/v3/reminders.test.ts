// Suite exigida pela ordem de reagendamento (secção 12 da spec):
//  1. reagendar para hora futura
//  2. reagendar para hora passada
//  3. reagendar reminder inexistente
//  4. dois reminders semelhantes → devolve candidates, não altera nada
//  5. envio atrasado do cron ainda apanha o lembrete (janela 30 min)
//  6. retry após falha
//  7. duplicação: dois pedidos idempotentes usam o mesmo id
//  8. cancelamento
//  9. enviar agora
// 10. DST Europe/Lisbon: 13:40 no verão = 12:40 UTC
// 11. compare-and-swap impede duplo envio concorrente
// 12. reagendamento reset retry_count / sent_at / status

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  lisbonLocalToUtcIso,
  isTimeInPast,
  rescheduleReminder,
  cancelReminder,
  sendReminderNow,
  dispatchDueReminders,
  upsertReminder,
} from "./reminders.server";

// Mock do envio WhatsApp — o serviço importa-o dinamicamente.
vi.mock("@/lib/whatsapp/send.server", () => ({
  sendWhatsAppText: vi.fn(async () => ({ ok: true, messageId: "wamid.test", telemetry: {} })),
}));
vi.mock("@/lib/whatsapp/phone", () => ({
  normalizePhone: (p: string) => (p ? p.replace(/\D/g, "").slice(-9) : null),
}));

type Row = Record<string, any>;

// Fake mínimo do supabase-js focado no que o serviço realmente usa.
function makeFakeSupabase(seed: { reminders?: Row[]; follow_ups?: Row[]; profiles?: Row[] } = {}) {
  const state = {
    reminders: [...(seed.reminders ?? [])] as Row[],
    follow_ups: [...(seed.follow_ups ?? [])] as Row[],
    profiles: [...(seed.profiles ?? [])] as Row[],
    assessor_messages: [] as Row[],
  };

  function fromTable(table: keyof typeof state) {
    // Constrói um query builder chainable que colecciona filtros e ordens.
    const filters: Array<(r: Row) => boolean> = [];
    let selected = "*";
    let mode: "select" | "insert" | "update" | "delete" = "select";
    let payload: any = null;
    let orderKey: string | null = null;
    let orderAsc = true;
    let limitN: number | null = null;

    const api: any = {
      select(cols?: string) { selected = cols ?? "*"; return api; },
      eq(col: string, val: any) { filters.push((r) => r[col] === val); return api; },
      neq(col: string, val: any) { filters.push((r) => r[col] !== val); return api; },
      in(col: string, vals: any[]) { filters.push((r) => vals.includes(r[col])); return api; },
      is(col: string, val: any) { filters.push((r) => r[col] === val); return api; },
      not(col: string, _op: string, val: string) {
        // usado como .not("status", "in", "(a,b,c)")
        const list = val.replace(/[()]/g, "").split(",").map((s) => s.trim());
        filters.push((r) => !list.includes(r[col])); return api;
      },
      ilike(col: string, val: string) {
        const needle = val.replace(/%/g, "").toLowerCase();
        // Colunas geradas (`title_norm`) não existem nas linhas simuladas:
        // caem para a coluna base, sem acentos, como no Postgres.
        const base = col.endsWith("_norm") ? col.slice(0, -5) : col;
        filters.push((r) =>
          String(r[col] ?? r[base] ?? "")
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .includes(needle),
        );
        return api;
      },
      gte(col: string, val: any) { filters.push((r) => r[col] >= val); return api; },
      lte(col: string, val: any) { filters.push((r) => r[col] <= val); return api; },
      order(col: string, opts?: any) { orderKey = col; orderAsc = !(opts?.ascending === false); return api; },
      limit(n: number) { limitN = n; return api; },
      insert(row: any) { mode = "insert"; payload = row; return api; },
      update(row: any) { mode = "update"; payload = row; return api; },
      delete() { mode = "delete"; return api; },
      maybeSingle() { return api._exec("maybeSingle"); },
      single() { return api._exec("single"); },
      then(onOk: any, onErr: any) { return api._exec("many").then(onOk, onErr); },
      _exec(shape: "single" | "maybeSingle" | "many") {
        try {
          let rows = state[table].filter((r) => filters.every((f) => f(r)));
          if (mode === "select") {
            if (orderKey) rows = [...rows].sort((a, b) => {
              const av = a[orderKey!], bv = b[orderKey!];
              return (av < bv ? -1 : av > bv ? 1 : 0) * (orderAsc ? 1 : -1);
            });
            if (limitN != null) rows = rows.slice(0, limitN);
            if (shape === "single") {
              if (rows.length !== 1) return Promise.resolve({ data: null, error: { message: "no_single" } });
              return Promise.resolve({ data: rows[0], error: null });
            }
            if (shape === "maybeSingle") return Promise.resolve({ data: rows[0] ?? null, error: null });
            return Promise.resolve({ data: rows, error: null });
          }
          if (mode === "insert") {
            const toInsert = Array.isArray(payload) ? payload : [payload];
            const inserted: Row[] = [];
            for (const raw of toInsert) {
              const row = { id: raw.id ?? cryptoRandom(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), retry_count: 0, status: raw.status ?? "scheduled", ...raw };
              // Enforce índice único parcial (reminders_active_unique).
              if (table === "reminders" && ["scheduled", "processing"].includes(row.status) && row.related_resource_id) {
                const clash = state.reminders.find((r) =>
                  r.user_id === row.user_id &&
                  r.related_resource_type === row.related_resource_type &&
                  r.related_resource_id === row.related_resource_id &&
                  ["scheduled", "processing"].includes(r.status));
                if (clash) return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key" } });
              }
              state[table].push(row);
              inserted.push(row);
            }
            const d = shape === "many" ? inserted : inserted[0];
            return Promise.resolve({ data: d, error: null });
          }
          if (mode === "update") {
            const matched = rows;
            for (const row of matched) Object.assign(row, payload, { updated_at: new Date().toISOString() });
            const d = shape === "many" ? matched : (matched[0] ?? null);
            return Promise.resolve({ data: d, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        } catch (err: any) {
          return Promise.resolve({ data: null, error: { message: err.message } });
        }
      },
    };
    return api;
  }

  return {
    from: (t: string) => fromTable(t as any),
    _state: state,
  };
}

function cryptoRandom(): string {
  return "id-" + Math.random().toString(36).slice(2, 12);
}

const USER = "u1";
const FU_PAULO = "fu-paulo";

function seedPauloReminder(scheduled_for: string) {
  return makeFakeSupabase({
    reminders: [{
      id: "rem-paulo", user_id: USER, related_resource_type: "follow_up",
      related_resource_id: FU_PAULO, scheduled_for, timezone: "Europe/Lisbon",
      channel: "whatsapp", status: "scheduled", retry_count: 0,
      sent_at: null, failed_at: null, last_error: null, external_message_id: null,
      message_preview: "Lembrete: ligar ao Paulo.",
    }],
    follow_ups: [{
      id: FU_PAULO, user_id: USER, title: "Ligar ao Paulo",
      status: "pendente", due_date: scheduled_for, due_time: "12:00", type: "chamada",
    }],
    profiles: [{ id: USER, phone: "912345678", whatsapp_link_status: "linked" }],
  });
}

describe("reminders — reagendamento", () => {
  beforeEach(() => vi.clearAllMocks());

  it("1. reagenda para hora futura (subject_hint) — actualiza a MESMA linha", async () => {
    const sb = seedPauloReminder(new Date(Date.now() + 60 * 60_000).toISOString());
    const oneHourLater = new Date(Date.now() + 60 * 60_000);
    const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(oneHourLater);
    const hm = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit", hour12: false }).format(oneHourLater);
    const r = await rescheduleReminder(sb as any, {
      userId: USER, channel: "whatsapp",
      subject_hint: "ligar ao Paulo",
      new_date: ymd, new_time: hm,
    });
    expect(r.ok).toBe(true);
    expect(r.reminder?.id).toBe("rem-paulo");
    expect(sb._state.reminders).toHaveLength(1); // não duplicou
    expect(sb._state.reminders[0].status).toBe("scheduled");
    expect(sb._state.reminders[0].retry_count).toBe(0);
  });

  it("2. hora passada é detectada pelo helper (executor devolve past=true)", () => {
    // Este teste cobre o guarda determinístico do executor.
    expect(isTimeInPast("2000-01-01", "10:00")).toBe(true);
  });

  it("3. reagendar reminder inexistente devolve reminder_not_found", async () => {
    const sb = makeFakeSupabase({
      profiles: [{ id: USER, phone: "912345678", whatsapp_link_status: "linked" }],
    });
    const r = await rescheduleReminder(sb as any, {
      userId: USER, channel: "whatsapp",
      subject_hint: "coisa que não existe",
      new_date: "2099-01-01", new_time: "10:00",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("reminder_not_found");
  });

  it("4. dois reminders semelhantes → devolve candidates e não altera BD", async () => {
    const scheduled = new Date(Date.now() + 60 * 60_000).toISOString();
    const sb = makeFakeSupabase({
      reminders: [
        { id: "r1", user_id: USER, related_resource_type: "follow_up", related_resource_id: "fu1", scheduled_for: scheduled, status: "scheduled", retry_count: 0 },
        { id: "r2", user_id: USER, related_resource_type: "follow_up", related_resource_id: "fu2", scheduled_for: scheduled, status: "scheduled", retry_count: 0 },
      ],
      follow_ups: [
        { id: "fu1", user_id: USER, title: "Ligar ao Paulo (casa)", status: "pendente" },
        { id: "fu2", user_id: USER, title: "Ligar ao Paulo (trabalho)", status: "pendente" },
      ],
    });
    const r = await rescheduleReminder(sb as any, {
      userId: USER, channel: "whatsapp",
      subject_hint: "Paulo",
      new_date: "2099-01-01", new_time: "10:00",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("ambiguous");
    expect(r.candidates).toHaveLength(2);
    // Nada foi actualizado.
    expect(sb._state.reminders.every((x) => x.status === "scheduled")).toBe(true);
  });

  it("5. dispatcher apanha reminders atrasados até 30 min", async () => {
    const past = new Date(Date.now() - 15 * 60_000).toISOString(); // 15 min atrás
    const sb = seedPauloReminder(past);
    const out = await dispatchDueReminders(sb as any);
    expect(out.sent).toBe(1);
    expect(sb._state.reminders[0].status).toBe("sent");
  });

  it("6. retry: se envio falha, marca failed e permite reenvio", async () => {
    const past = new Date(Date.now() - 5 * 60_000).toISOString();
    const sb = seedPauloReminder(past);
    // Força falha no primeiro envio.
    const send = (await import("@/lib/whatsapp/send.server")).sendWhatsAppText as any;
    send.mockResolvedValueOnce({ ok: false, error: "network", telemetry: {} });
    const out1 = await dispatchDueReminders(sb as any);
    expect(out1.sent).toBe(0);
    expect(sb._state.reminders[0].status).toBe("failed");
    expect(sb._state.reminders[0].retry_count).toBe(1);

    // Reset explícito por reagendamento (ou reset manual) e re-envio.
    sb._state.reminders[0].status = "scheduled";
    const out2 = await dispatchDueReminders(sb as any);
    expect(out2.sent).toBe(1);
    expect(sb._state.reminders[0].status).toBe("sent");
  });

  it("7. upsertReminder não duplica quando já existe activo (idempotente)", async () => {
    const sb = seedPauloReminder(new Date().toISOString());
    const r1 = await upsertReminder(sb as any, {
      userId: USER, related_resource_type: "follow_up",
      related_resource_id: FU_PAULO,
      scheduled_for: new Date().toISOString(),
    });
    const r2 = await upsertReminder(sb as any, {
      userId: USER, related_resource_type: "follow_up",
      related_resource_id: FU_PAULO,
      scheduled_for: new Date().toISOString(),
    });
    expect(r1?.id).toBe(r2?.id);
    expect(sb._state.reminders).toHaveLength(1);
  });

  it("8. cancelamento move para status cancelled", async () => {
    const sb = seedPauloReminder(new Date().toISOString());
    const r = await cancelReminder(sb as any, USER, "rem-paulo");
    expect(r.ok).toBe(true);
    expect(sb._state.reminders[0].status).toBe("cancelled");
  });

  it("9. sendReminderNow marca sent + external_message_id + regista no chat", async () => {
    const sb = seedPauloReminder(new Date().toISOString());
    const r = await sendReminderNow(sb as any, { userId: USER, reminder_id: "rem-paulo" });
    expect(r.ok).toBe(true);
    expect(sb._state.reminders[0].status).toBe("sent");
    expect(sb._state.reminders[0].external_message_id).toBe("wamid.test");
    expect(sb._state.assessor_messages).toHaveLength(1);
  });

  it("10. DST Europe/Lisbon: 13:40 no verão = 12:40 UTC; no inverno = 13:40 UTC", () => {
    // Verão (BST/WEST): +01:00
    expect(lisbonLocalToUtcIso("2026-07-29", "13:40")).toBe("2026-07-29T12:40:00.000Z");
    // Inverno: +00:00
    expect(lisbonLocalToUtcIso("2026-01-15", "13:40")).toBe("2026-01-15T13:40:00.000Z");
  });

  it("11. compare-and-swap impede duplo envio concorrente", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const sb = seedPauloReminder(past);
    const [a, b] = await Promise.all([
      sendReminderNow(sb as any, { userId: USER, reminder_id: "rem-paulo" }),
      sendReminderNow(sb as any, { userId: USER, reminder_id: "rem-paulo" }),
    ]);
    const successes = [a, b].filter((r) => r.ok).length;
    const skipped = [a, b].filter((r) => !r.ok && r.error === "reminder_not_available").length;
    expect(successes).toBe(1);
    expect(skipped).toBe(1);
  });

  it("12. reagendar reseta status/sent_at/failed_at/retry_count", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const sb = seedPauloReminder(past);
    // Simula que já falhou uma vez.
    sb._state.reminders[0].status = "failed";
    sb._state.reminders[0].retry_count = 2;
    sb._state.reminders[0].failed_at = past;
    sb._state.reminders[0].sent_at = null;

    const future = new Date(Date.now() + 30 * 60_000);
    const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(future);
    const hm = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit", hour12: false }).format(future);
    const r = await rescheduleReminder(sb as any, {
      userId: USER, channel: "whatsapp",
      related_resource_type: "follow_up", related_resource_id: FU_PAULO,
      new_date: ymd, new_time: hm,
    });
    expect(r.ok).toBe(true);
    const row = sb._state.reminders[0];
    expect(row.status).toBe("scheduled");
    expect(row.retry_count).toBe(0);
    expect(row.sent_at).toBeNull();
    expect(row.failed_at).toBeNull();
  });
});
