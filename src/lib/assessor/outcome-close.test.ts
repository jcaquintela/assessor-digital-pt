import { describe, it, expect } from "vitest";
import { applyFollowUpOutcome } from "./proactive/outcomes.server";
import { detectOutcomeFromText } from "./outcome-intent";
import { statusForOutcome } from "./outcome-status";
import { formatForWhatsApp } from "./culture/whatsapp-format";
import { enforceHumanTone } from "./culture/sanitize";

/** Supabase falso: guarda os updates por tabela. */
function fakeDb(followUp: any) {
  const updates: Record<string, any[]> = { follow_ups: [], reminders: [] };
  const supabase = {
    from(table: string) {
      const b: any = {
        _patch: null,
        select: () => b, eq: () => b, in: () => b, is: () => b, not: () => b,
        gte: () => b, lt: () => b, order: () => b, limit: () => b,
        update: (p: any) => { updates[table]?.push(p); return b; },
        maybeSingle: () => Promise.resolve({ data: table === "follow_ups" ? followUp : null }),
        then: (res: any) => res({ data: [], error: null }),
      };
      return b;
    },
  };
  return { supabase, updates };
}

describe("resultado do seguimento fecha o item", () => {
  it("'sem efeito' arquiva o seguimento e cancela o aviso", async () => {
    const { supabase, updates } = fakeDb({ id: "f1", title: "Ligar ao Sr. Nogueira" });
    const r = await applyFollowUpOutcome(supabase, "u1", "f1", "nao_realizado");
    expect(r.ok).toBe(true);
    expect(updates.follow_ups[0]).toMatchObject({ outcome: "nao_realizado", status: "Arquivado" });
    expect(updates.reminders[0]).toMatchObject({ status: "cancelled" });
  });

  it("'precisa seguimento' mantém o item aberto", async () => {
    const { supabase, updates } = fakeDb({ id: "f1", title: "x" });
    await applyFollowUpOutcome(supabase, "u1", "f1", "precisa_nova_acao");
    expect(updates.follow_ups[0].status).toBeUndefined();
    expect(updates.reminders).toHaveLength(0);
  });

  it("estados terminais fecham, os outros não", () => {
    expect(statusForOutcome("concluido")).toBe("Concluído");
    expect(statusForOutcome("nao_realizado")).toBe("Arquivado");
    expect(statusForOutcome("sem_resposta")).toBe("Arquivado");
    expect(statusForOutcome("adiado")).toBeNull();
  });
});

describe("resultado escrito em texto livre", () => {
  it("apanha a frase real do consultor", () => {
    expect(detectOutcomeFromText("Já liguei. Fica sem efeito, escolheu outro consultor")).toBe("nao_realizado");
    expect(detectOutcomeFromText("Liguei ontem")).toBe("concluido");
    expect(detectOutcomeFromText("Não atendeu, ligo mais tarde")).toBe("precisa_nova_acao");
  });
  it("não sequestra conversa normal", () => {
    expect(detectOutcomeFromText("Lembra-me de ligar ao Sr. Nogueira")).toBeNull();
    expect(detectOutcomeFromText("Bom dia, o que tenho hoje?")).toBeNull();
  });
});

describe("nunca cortar dentro de negrito", () => {
  it("não corta em 'Sr.'", () => {
    const t = "Sem problema. Queres ligar já ao *Sr. Nogueira* ou prefiro avisar-te mais tarde?";
    expect(enforceHumanTone(t)).toContain("*Sr. Nogueira*");
  });
  it("fecha marcadores soltos antes de enviar", () => {
    expect(formatForWhatsApp("Boa. Ligas agora ao *Sr.")).toBe("Boa. Ligas agora ao Sr.");
  });
});
