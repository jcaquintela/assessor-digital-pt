// Envio direto de convites do piloto: base simulada (mesma semântica do SQL),
// envios falsos. Nenhuma mensagem real, nenhum convite real.
import { afterEach, describe, expect, it } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { __resetAccountFlagsForTests } from "@/lib/flags/account-flag.server";
import { PILOT_KEY } from "./pilot";
import { PILOT_INVITE_DELIVERY_FLAG, PILOT_INVITE_TEMPLATE_SETTING, nextDeliveryStatus, deliveryRetryVerdict, channelPermission } from "./invite-delivery";
import { applyPilotDeliveryStatus, sendPilotInvite, type DeliveryDeps } from "./invite-delivery.server";

const JULIO = "00000000-0000-0000-0000-0000000000j1";
const IOLANDA = "00000000-0000-0000-0000-0000000000i1";
const PEDRO = "00000000-0000-0000-0000-0000000000p1";
const TELMO = "00000000-0000-0000-0000-0000000000t1";
const SUPPORT = "00000000-0000-0000-0000-0000000000s1";
const G1 = "00000000-0000-0000-0000-0000000000g1";
const G2 = "00000000-0000-0000-0000-0000000000g2";
const G3 = "00000000-0000-0000-0000-0000000000g3";
const DAY = 864e5;
const recent = () => new Date(Date.now() - 3600_000).toISOString();
const old = () => new Date(Date.now() - 3 * DAY).toISOString();

function makeDb(o: { status?: string; flagOn?: boolean; lastInbound?: string; template?: string | null; optIns?: string[] } = {}) {
  const guest = (id: string, name: string, phone: string) => ({ id, name, phone, whatsapp_link_status: "linked", is_beta_tester: false, subscription_tier: "base" });
  const db: any = makeFakeSupabase({
    profiles: [
      { id: JULIO, name: "Júlio" }, { id: IOLANDA, name: "Iolanda" }, { id: PEDRO, name: "Pedro" },
      { id: TELMO, name: "Telmo", phone: "+351910000009", whatsapp_link_status: "linked", is_beta_tester: true, subscription_tier: "base" },
      { id: SUPPORT, name: "Apoio" },
      guest(G1, "Ana Silva", "+351910000001"), guest(G2, "Bruno", "+351910000002"), guest(G3, "Carla", "+351910000003"),
    ],
    user_roles: [{ user_id: JULIO, role: "super_admin" }, { user_id: SUPPORT, role: "support_admin" }],
    pilots: [{ key: PILOT_KEY, status: o.status ?? "go", invite_issuer_user_id: JULIO, invite_cap: 2, invite_ttl_days: 7 }],
    pilot_participants: [
      { pilot_key: PILOT_KEY, user_id: JULIO, status: "active" }, { pilot_key: PILOT_KEY, user_id: IOLANDA, status: "active" },
      { pilot_key: PILOT_KEY, user_id: PEDRO, status: "active" }, { pilot_key: PILOT_KEY, user_id: TELMO, status: "excluded" },
    ],
    feature_flags: [{ key: PILOT_INVITE_DELIVERY_FLAG, enabled_globally: o.flagOn ?? true }],
    feature_flag_users: [],
    account_access: [G1, G2, G3, TELMO, IOLANDA].map((user_id) => ({ user_id, state: "registered_waiting" })),
    channel_links: [{ user_id: G1, channel: "telegram", external_id: "tg-111" }],
    consultant_preferences: [G1, G2, G3].map((user_id) => ({ user_id, explicit_opt_ins: o.optIns ?? [] })),
    assessor_messages: [G1, G2, G3].map((user_id) => ({ user_id, channel: "whatsapp", role: "user", created_at: o.lastInbound ?? recent() })),
    app_settings: o.template ? [{ key: PILOT_INVITE_TEMPLATE_SETTING, value: o.template }] : [],
    access_invites: [], pilot_invite_deliveries: [],
  });
  const t = (n: string) => (db.state[n] ??= []);
  const live = (r: any) => r.status === "used" || (r.status === "issued" && new Date(r.expires_at).getTime() > Date.now());
  // Unicidade (pilot_key, recipient_user_id), como na base.
  const baseFrom = db.from;
  db.from = (name: string) => {
    const api = baseFrom(name);
    if (name !== "pilot_invite_deliveries") return api;
    const ins = api.insert;
    api.insert = (p: any) => {
      if (t(name).some((r: any) => r.pilot_key === p.pilot_key && r.recipient_user_id === p.recipient_user_id)) {
        const err: any = { select: () => err, maybeSingle: async () => ({ data: null, error: { code: "23505", message: "duplicate key" } }) };
        return err;
      }
      return ins(p);
    };
    return api;
  };
  db.rpc = async (fn: string, a: any) => {
    const p = t("pilots").find((r: any) => r.key === a._pilot_key);
    const superAdmin = (u: string) => t("user_roles").some((r: any) => r.user_id === u && r.role === "super_admin");
    if (fn === "issue_pilot_invite") {
      if (!a._issuer || (p.invite_issuer_user_id !== a._issuer && !superAdmin(a._issuer))) return { data: [{ out_outcome: "not_issuer", out_remaining: 0 }], error: null };
      const n = t("access_invites").filter((r: any) => r.pilot_key === a._pilot_key && live(r)).length;
      const prev = t("access_invites").find((r: any) => r.issuer_user_id === a._issuer && r.idempotency_key === a._idempotency_key);
      if (prev) return { data: [{ out_invite_id: prev.id, out_outcome: "replayed", out_remaining: p.invite_cap - n }], error: null };
      if (p.status !== "go") return { data: [{ out_outcome: "not_open", out_remaining: 0 }], error: null };
      if (n >= p.invite_cap) return { data: [{ out_outcome: "cap_reached", out_remaining: 0 }], error: null };
      const id = `inv-${t("access_invites").length + 1}`;
      t("access_invites").push({ id, token_hash: a._token_hash, issuer_user_id: a._issuer, source: "pilot", pilot_key: a._pilot_key,
        idempotency_key: a._idempotency_key, issued_via: a._issued_via, status: "issued", expires_at: new Date(Date.now() + 7 * DAY).toISOString() });
      return { data: [{ out_invite_id: id, out_outcome: "issued", out_remaining: p.invite_cap - n - 1 }], error: null };
    }
    if (fn === "revoke_pilot_invite") {
      const inv = t("access_invites").find((r: any) => r.id === a._invite_id);
      if (!inv || inv.status !== "issued" || !(inv.issuer_user_id === a._actor || superAdmin(a._actor))) return { data: "not_found", error: null };
      inv.status = "revoked";
      return { data: "revoked", error: null };
    }
    throw new Error(`rpc ${fn}`);
  };
  return db;
}

function fakeSender(fail: Array<"wa" | "tpl" | "tg"> = []) {
  const sent: Array<{ kind: string; to: string; text: string }> = [];
  let n = 0;
  const deps: DeliveryDeps = {
    async sendWhatsAppText(to, text) { sent.push({ kind: "wa", to, text }); return fail.includes("wa") ? { ok: false, errorCode: "131047" } : { ok: true, providerMessageId: `wamid.${++n}` }; },
    async sendWhatsAppTemplate(to, tpl, params) { sent.push({ kind: "tpl", to, text: `${tpl}:${params.join(",")}` }); return fail.includes("tpl") ? { ok: false, errorCode: "132000" } : { ok: true, providerMessageId: `wamid.${++n}` }; },
    async sendTelegramText(to, text) { sent.push({ kind: "tg", to, text }); return fail.includes("tg") ? { ok: false, errorCode: "403" } : { ok: true, providerMessageId: `${++n}` }; },
  };
  return { sent, deps };
}

const req = (recipientUserId: string, channel: "whatsapp" | "telegram" = "whatsapp", actor = JULIO) =>
  ({ actor, recipientUserId, channel, confirm: { recipientUserId, channel } });
const liveInvites = (db: any) => db.state.access_invites.filter((r: any) => r.status === "issued" || r.status === "used").length;

afterEach(() => __resetAccountFlagsForTests());

describe("envio direto de convites do piloto", () => {
  it("interruptor desligado: nada é emitido nem enviado", async () => {
    const db = makeDb({ flagOn: false }); const s = fakeSender();
    expect((await sendPilotInvite(db, req(G1), s.deps)).outcome).toBe("disabled");
    expect(db.state.access_invites).toHaveLength(0);
    expect(db.state.pilot_invite_deliveries).toHaveLength(0);
    expect(s.sent).toHaveLength(0);
  });

  it("confirmação tem de corresponder ao destinatário e ao canal", async () => {
    const db = makeDb(); const s = fakeSender();
    const r = await sendPilotInvite(db, { ...req(G1), confirm: { recipientUserId: G2, channel: "whatsapp" } }, s.deps);
    expect(r.outcome).toBe("confirm_mismatch");
    const r2 = await sendPilotInvite(db, { ...req(G1), confirm: { recipientUserId: G1, channel: "telegram" } }, s.deps);
    expect(r2.outcome).toBe("confirm_mismatch");
    expect(s.sent).toHaveLength(0);
  });

  it("support_admin não pode enviar", async () => {
    const db = makeDb(); const s = fakeSender();
    expect((await sendPilotInvite(db, req(G1, "whatsapp", SUPPORT), s.deps)).outcome).toBe("forbidden");
    expect(db.state.access_invites).toHaveLength(0);
  });

  it("participantes atuais e Telmo (excluído) nunca recebem convite", async () => {
    const db = makeDb(); const s = fakeSender();
    for (const u of [JULIO, IOLANDA, PEDRO, TELMO]) {
      expect((await sendPilotInvite(db, req(u), s.deps)).outcome).toBe("already_participant");
    }
    expect(db.state.access_invites).toHaveLength(0);
    expect(s.sent).toHaveLength(0);
    expect(db.state.profiles.find((p: any) => p.id === TELMO)).toMatchObject({ is_beta_tester: true, subscription_tier: "base", whatsapp_link_status: "linked" });
  });

  it("envio na janela de 24 h: aceite pelo WhatsApp, código só na mensagem", async () => {
    const db = makeDb(); const s = fakeSender();
    const r = await sendPilotInvite(db, req(G1), s.deps);
    expect(r.outcome).toBe("accepted");
    expect(s.sent).toHaveLength(1);
    const code = s.sent[0].text.match(/código é (\S+)/)![1];
    expect(JSON.stringify(db.state)).not.toContain(code);
    expect(db.state.pilot_invite_deliveries[0]).toMatchObject({ status: "accepted", provider_message_id: "wamid.1", attempts: 1, invite_id: "inv-1" });
  });

  it("repetir o envio não envia de novo nem gasta outra vaga", async () => {
    const db = makeDb(); const s = fakeSender();
    await sendPilotInvite(db, req(G1), s.deps);
    expect((await sendPilotInvite(db, req(G1), s.deps)).outcome).toBe("already_sent");
    expect(s.sent).toHaveLength(1);
    expect(liveInvites(db)).toBe(1);
  });

  it("dois cliques ao mesmo tempo: um envio, uma vaga", async () => {
    const db = makeDb(); const s = fakeSender();
    const rs = await Promise.all([sendPilotInvite(db, req(G1), s.deps), sendPilotInvite(db, req(G1), s.deps)]);
    expect(rs.map((r) => r.outcome).sort()).toEqual(["accepted", "in_flight"]);
    expect(s.sent).toHaveLength(1);
    expect(liveInvites(db)).toBe(1);
  });

  it("falha no envio anula o convite e liberta a vaga; nova tentativa reutiliza o registo", async () => {
    const db = makeDb(); const bad = fakeSender(["wa"]);
    expect((await sendPilotInvite(db, req(G1), bad.deps)).outcome).toBe("send_failed");
    expect(liveInvites(db)).toBe(0);
    expect(db.state.pilot_invite_deliveries[0]).toMatchObject({ status: "failed", error_code: "131047" });
    const ok = fakeSender();
    expect((await sendPilotInvite(db, req(G1), ok.deps)).outcome).toBe("accepted");
    expect(db.state.pilot_invite_deliveries).toHaveLength(1);
    expect(db.state.pilot_invite_deliveries[0].attempts).toBe(2);
    expect(liveInvites(db)).toBe(1);
  });

  it("teto de 2 vagas: o terceiro fica bloqueado sem convite", async () => {
    const db = makeDb(); const s = fakeSender();
    expect((await sendPilotInvite(db, req(G1), s.deps)).outcome).toBe("accepted");
    expect((await sendPilotInvite(db, req(G2), s.deps)).outcome).toBe("accepted");
    expect((await sendPilotInvite(db, req(G3), s.deps)).outcome).toBe("cap_reached");
    expect(db.state.access_invites).toHaveLength(2);
    expect(db.state.pilot_invite_deliveries.find((d: any) => d.recipient_user_id === G3).status).toBe("blocked");
    expect(s.sent).toHaveLength(2);
  });

  it("piloto em NO-GO: não emite nem envia", async () => {
    const db = makeDb({ status: "no_go" }); const s = fakeSender();
    expect((await sendPilotInvite(db, req(G1), s.deps)).outcome).toBe("not_open");
    expect(db.state.access_invites).toHaveLength(0);
    expect(s.sent).toHaveLength(0);
  });

  it("fora da janela sem template aprovado: não envia", async () => {
    const db = makeDb({ lastInbound: old() }); const s = fakeSender();
    expect((await sendPilotInvite(db, req(G1), s.deps)).outcome).toBe("needs_template");
    expect(db.state.access_invites).toHaveLength(0);
  });

  it("fora da janela com template mas sem consentimento: não envia", async () => {
    const db = makeDb({ lastInbound: old(), template: "afonso_pilot_invite" }); const s = fakeSender();
    expect((await sendPilotInvite(db, req(G1), s.deps)).outcome).toBe("needs_template");
    expect(s.sent).toHaveLength(0);
  });

  it("fora da janela com template aprovado e consentimento: usa o template", async () => {
    const db = makeDb({ lastInbound: old(), template: "afonso_pilot_invite", optIns: ["service_messages"] }); const s = fakeSender();
    expect((await sendPilotInvite(db, req(G1), s.deps)).outcome).toBe("accepted");
    expect(s.sent[0].kind).toBe("tpl");
    expect(s.sent[0].text.startsWith("afonso_pilot_invite:")).toBe(true);
  });

  it("Telegram: só com conversa iniciada pela pessoa", async () => {
    const db = makeDb(); const s = fakeSender();
    expect((await sendPilotInvite(db, req(G2, "telegram"), s.deps)).outcome).toBe("channel_unavailable");
    expect((await sendPilotInvite(db, req(G1, "telegram"), s.deps)).outcome).toBe("sent");
    expect(s.sent[0]).toMatchObject({ kind: "tg", to: "tg-111" });
  });

  it("estados do WhatsApp avançam e nunca recuam; falha depois de aceite liberta a vaga", async () => {
    const db = makeDb(); const s = fakeSender();
    await sendPilotInvite(db, req(G1), s.deps);
    await sendPilotInvite(db, req(G2), s.deps);
    expect(await applyPilotDeliveryStatus(db, "wamid.1", "delivered")).toBe(true);
    expect(await applyPilotDeliveryStatus(db, "wamid.1", "sent")).toBe(false);
    expect(await applyPilotDeliveryStatus(db, "wamid.1", "read")).toBe(true);
    expect(await applyPilotDeliveryStatus(db, "wamid.1", "failed")).toBe(false);
    expect(db.state.pilot_invite_deliveries[0].status).toBe("read");
    expect(await applyPilotDeliveryStatus(db, "wamid.2", "failed", "131026")).toBe(true);
    expect(db.state.pilot_invite_deliveries[1]).toMatchObject({ status: "failed", error_code: "131026" });
    expect(db.state.access_invites.find((i: any) => i.id === "inv-2").status).toBe("revoked");
    expect(liveInvites(db)).toBe(1);
  });

  it("tentativa interrompida (a emitir há >5 min): retoma e anula o convite anterior", async () => {
    const db = makeDb(); const s = fakeSender();
    await sendPilotInvite(db, req(G1), s.deps);
    Object.assign(db.state.pilot_invite_deliveries[0], { status: "issuing", last_attempt_at: new Date(Date.now() - 10 * 60_000).toISOString() });
    expect((await sendPilotInvite(db, req(G1), s.deps)).outcome).toBe("accepted");
    expect(db.state.access_invites.find((i: any) => i.id === "inv-1").status).toBe("revoked");
    expect(liveInvites(db)).toBe(1);
  });
});

describe("regras puras", () => {
  it("ordem de estados", () => {
    expect(nextDeliveryStatus("accepted", "sent")).toBe("sent");
    expect(nextDeliveryStatus("delivered", "sent")).toBeNull();
    expect(nextDeliveryStatus("delivered", "failed")).toBeNull();
    expect(nextDeliveryStatus("sent", "failed")).toBe("failed");
    expect(nextDeliveryStatus("failed", "delivered")).toBeNull();
  });
  it("reenvio só se o convite anterior deixou de valer", () => {
    const now = Date.now();
    expect(deliveryRetryVerdict({ status: "delivered", last_attempt_at: "", invite_status: "issued", invite_expires_at: new Date(now + DAY).toISOString() }, now)).toBe("already_sent");
    expect(deliveryRetryVerdict({ status: "delivered", last_attempt_at: "", invite_status: "issued", invite_expires_at: new Date(now - 1).toISOString() }, now)).toBe("retry");
    expect(deliveryRetryVerdict({ status: "read", last_attempt_at: "", invite_status: "used" }, now)).toBe("already_sent");
    expect(deliveryRetryVerdict({ status: "issuing", last_attempt_at: new Date(now - 60_000).toISOString() }, now)).toBe("in_flight");
  });
  it("janela do WhatsApp", () => {
    const now = Date.now();
    const base = { channel: "whatsapp" as const, externalId: "351910000001", optIns: [], templateName: null };
    expect(channelPermission({ ...base, lastInboundAtMs: now - 23 * 3600_000 }, now)).toEqual({ ok: true, mode: "free_text" });
    expect(channelPermission({ ...base, lastInboundAtMs: now - 25 * 3600_000 }, now)).toEqual({ ok: false, outcome: "needs_template" });
    expect(channelPermission({ ...base, externalId: null, lastInboundAtMs: now }, now)).toEqual({ ok: false, outcome: "channel_unavailable" });
  });
});
