// Regras da conversa partilhada WhatsApp + Telegram (Fase 2 ACI V1).
import { describe, it, expect, beforeEach } from "vitest";
import { scopeFor, stateKeyFor, ACCOUNT_SCOPE } from "./scope";
import { decideBinding, isBlindAnswer, representText, type PendingLite } from "./binding";
import {
  isCrossChannelEnabled,
  __resetCrossChannelStateForTests,
} from "./scope.server";
import { createFakeDb } from "./test-fake-db";

const t0 = Date.parse("2026-11-14T10:00:00Z");
const at = (min: number) => new Date(t0 + min * 60_000).toISOString();
const pend = (over: Partial<PendingLite>): PendingLite => ({
  id: "p1", channel: "whatsapp", intent: "create_reminder", created_at: at(0),
  presented_channels: [], current_question: "Crio o lembrete para ligar à Joana amanhã?", ...over,
});

beforeEach(() => __resetCrossChannelStateForTests());

describe("âmbito da conversa", () => {
  it("desligado: cada canal tem a sua conversa (comportamento antigo)", () => {
    const s = scopeFor(false, "telegram");
    expect(s.shared).toBe(false);
    expect(s.channels).toEqual(["telegram"]);
    expect(s.lockChannel).toBe("telegram");
    expect(stateKeyFor(false, "whatsapp", "default")).toMatchObject({ channel: "whatsapp", externalId: "default", shared: false });
  });

  it("ligado: WhatsApp e Telegram partilham pendentes, estado e lock por conta", () => {
    for (const ch of ["whatsapp", "telegram"]) {
      const s = scopeFor(true, ch);
      expect(s.shared).toBe(true);
      expect(s.channels).toEqual(["whatsapp", "telegram"]);
      expect(s.lockChannel).toBe(ACCOUNT_SCOPE);
      const k = stateKeyFor(true, ch);
      expect(k.channel).toBe(ACCOUNT_SCOPE);
      expect(k.extra).toEqual({ last_channel: ch }); // origem preservada
    }
  });

  it("o painel nunca entra na conversa partilhada", () => {
    expect(scopeFor(true, "dashboard").channels).toEqual(["dashboard"]);
    expect(stateKeyFor(true, "dashboard").shared).toBe(false);
  });

  it("interruptor: desligado por defeito, ligado só para contas incluídas, erro = desligado", async () => {
    const db = createFakeDb({
      feature_flags: [{ key: "assessor.cross_channel.v1", enabled_globally: false }],
      feature_flag_users: [{ flag_key: "assessor.cross_channel.v1", user_id: "u-in" }],
    });
    expect(await isCrossChannelEnabled(db, "u-out")).toBe(false);
    expect(await isCrossChannelEnabled(db, "u-in")).toBe(true);
    const broken = { from() { throw new Error("rede em baixo"); } };
    expect(await isCrossChannelEnabled(broken, "u-x")).toBe(false);
  });
});

describe("resposta cega noutro canal", () => {
  it("reconhece respostas cegas e ignora instruções com conteúdo", () => {
    for (const t of ["sim", "Sim!", "ok", "não", "pode ser", "sim, avança", "👍"]) expect(isBlindAnswer(t)).toBe(true);
    for (const t of ["Marca reunião com o Rui sexta às 10h", "Quem é a Joana?", ""]) expect(isBlindAnswer(t)).toBe(false);
  });

  it("'sim' no Telegram a uma pergunta só feita no WhatsApp volta a perguntar, não executa", () => {
    const d = decideBinding({ text: "sim", channel: "telegram", active: [pend({})] });
    expect(d.kind).toBe("represent");
    if (d.kind === "represent") {
      expect(d.pending.id).toBe("p1");
      expect(representText(d.pending)).toContain("no WhatsApp");
      expect(representText(d.pending)).toContain("Crio o lembrete");
    }
  });

  it("'sim' no canal onde a pergunta foi mostrada confirma esse pendente", () => {
    const d = decideBinding({ text: "sim", channel: "whatsapp", active: [pend({})] });
    expect(d).toEqual({ kind: "bind", pendingIds: ["p1"] });
  });

  it("depois de re-perguntada no Telegram, o 'sim' no Telegram confirma", () => {
    const d = decideBinding({
      text: "sim", channel: "telegram", active: [pend({ presented_channels: ["whatsapp", "telegram"] })],
    });
    expect(d).toEqual({ kind: "bind", pendingIds: ["p1"] });
  });

  it("nunca a ação errada: A visível no WhatsApp, B nasceu no Telegram → 'sim' no WhatsApp re-pergunta B", () => {
    // A foi substituída por B (já não está ativa); o consultor ainda vê A no WhatsApp.
    const b = pend({ id: "pB", channel: "telegram", created_at: at(5), current_question: "Marco a visita ao T2 para sábado?" });
    const d = decideBinding({ text: "sim", channel: "whatsapp", active: [b] });
    expect(d.kind).toBe("represent");
    if (d.kind === "represent") expect(representText(d.pending)).toContain("Marco a visita");
  });

  it("havendo um pendente mostrado aqui e outro só no outro canal, re-pergunta o do outro canal", () => {
    const here = pend({ id: "pW", channel: "whatsapp", intent: "confirm_keep_audio" });
    const there = pend({ id: "pT", channel: "telegram", created_at: at(3) });
    const d = decideBinding({ text: "sim", channel: "whatsapp", active: [here, there] });
    expect(d.kind === "represent" && d.pending.id).toBe("pT");
  });

  it("'sim' tardio no Telegram a algo já confirmado no WhatsApp diz que já ficou tratado", () => {
    const done = pend({ status: "executed", presented_channels: ["whatsapp", "telegram"], resolved_channel: "whatsapp" });
    const d = decideBinding({ text: "sim", channel: "telegram", active: [], recentlyResolved: [done] });
    expect(d).toMatchObject({ kind: "already_resolved", resolvedChannel: "whatsapp" });
  });

  it("instrução com conteúdo nunca é intercetada", () => {
    const d = decideBinding({ text: "Muda o lembrete da Joana para as 16h", channel: "telegram", active: [pend({})] });
    expect(d.kind).toBe("proceed");
  });
});
