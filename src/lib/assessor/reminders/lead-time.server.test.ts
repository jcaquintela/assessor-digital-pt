// Garante que o instante do lembrete usa SEMPRE a antecedência configurada,
// incluindo o caso 0 (aviso à hora do compromisso) e o fallback global.
import { describe, expect, it } from "vitest";
import { getReminderLeadMinutes, reminderInstantFor } from "./lead-time.server";

type Seed = { user?: number | null; global?: number | null; throws?: boolean };

function fakeSupabase(seed: Seed) {
  return {
    from(table: string) {
      const api: any = {
        select: () => api,
        eq: () => api,
        maybeSingle: async () => {
          if (seed.throws) throw new Error("db down");
          if (table === "consultant_preferences") {
            return { data: seed.user === undefined ? null : { reminder_lead_minutes: seed.user }, error: null };
          }
          return { data: seed.global === undefined ? null : { value_int: seed.global }, error: null };
        },
      };
      return api;
    },
  } as any;
}

const EVENT = "2026-08-14T09:00:00.000Z";

describe("antecedência efectiva dos lembretes (servidor)", () => {
  it("sem nada configurado → 0 min (aviso à hora do compromisso)", async () => {
    const sb = fakeSupabase({});
    expect(await getReminderLeadMinutes(sb, "u1")).toBe(0);
    expect(await reminderInstantFor(sb, "u1", EVENT)).toBe(EVENT);
  });

  it("usa o valor global quando o consultor não escolheu", async () => {
    const sb = fakeSupabase({ user: null, global: 15 });
    expect(await getReminderLeadMinutes(sb, "u1")).toBe(15);
    expect(await reminderInstantFor(sb, "u1", EVENT)).toBe("2026-08-14T08:45:00.000Z");
  });

  it("o valor do consultor manda sobre o global", async () => {
    const sb = fakeSupabase({ user: 30, global: 15 });
    expect(await reminderInstantFor(sb, "u1", EVENT)).toBe("2026-08-14T08:30:00.000Z");
  });

  it("consultor pode voltar explicitamente a 0 mesmo com global definido", async () => {
    const sb = fakeSupabase({ user: 0, global: 60 });
    expect(await getReminderLeadMinutes(sb, "u1")).toBe(0);
    expect(await reminderInstantFor(sb, "u1", EVENT)).toBe(EVENT);
  });

  it("valores inválidos caem para o seguinte da cadeia", async () => {
    expect(await getReminderLeadMinutes(fakeSupabase({ user: -5, global: 10 }), "u1")).toBe(10);
    expect(await getReminderLeadMinutes(fakeSupabase({ user: 9999, global: 999 }), "u1")).toBe(0);
  });

  it("se a leitura falhar, mantém o comportamento actual (0) em vez de rebentar", async () => {
    const sb = fakeSupabase({ throws: true });
    expect(await getReminderLeadMinutes(sb, "u1")).toBe(0);
    expect(await reminderInstantFor(sb, "u1", EVENT)).toBe(EVENT);
  });

  it("antecedência de 60 min atravessa a hora anterior sem perder o dia", async () => {
    const sb = fakeSupabase({ global: 60 });
    expect(await reminderInstantFor(sb, "u1", "2026-08-14T00:30:00.000Z"))
      .toBe("2026-08-13T23:30:00.000Z");
  });
});
