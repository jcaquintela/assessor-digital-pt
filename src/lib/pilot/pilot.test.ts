// Piloto AFONSO 2.0: participação independente de beta/plano/canais e
// convites do piloto com teto de 2, só do Júlio. Base simulada com a mesma
// semântica do SQL (issue_pilot_invite, consume_access_invite + gatilho).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";
import {
  __resetAccountFlagsForTests, __setAccountFlagForTests, isAccountFlagEnabled,
} from "@/lib/flags/account-flag.server";
import { PILOT_ENTITLEMENT_FLAG, PILOT_GATED_FLAGS, PILOT_INVITES_FLAG, PILOT_KEY, PILOT_CAP_REPLY, PILOT_NOT_OPEN_REPLY, PILOT_REPLAYED_REPLY } from "./pilot";
import { isPilotParticipant } from "./pilot-access.server";
import { EARLY_ACCESS_GATE_FLAG, REFERRAL_INVITES_FLAG, REFERRAL_QUOTA, hashInviteCode } from "@/lib/access/early-access";
import { handleBlockedInbound, handleReferralCommand, resolveAccess } from "@/lib/access/early-access.server";
import { isOpportunityNudgesEnabled } from "@/lib/opportunities/digest.server";
import { __resetCrossChannelStateForTests, isCrossChannelEnabled } from "@/lib/assessor/cross-channel/scope.server";

const JULIO = "00000000-0000-0000-0000-0000000000j1";
const IOLANDA = "00000000-0000-0000-0000-0000000000i1";
const PEDRO = "00000000-0000-0000-0000-0000000000p1";
const TELMO = "00000000-0000-0000-0000-0000000000t1";
const OTHER_BETA = "00000000-0000-0000-0000-0000000000b2";
const ADMIN = "00000000-0000-0000-0000-0000000000a1";
const GUEST = "00000000-0000-0000-0000-0000000000g1";
const ACTION_FIRST = "assessor.action_first_qualification.v1";
const DAY = 864e5;

function makeDb(opts: { pilotStatus?: string; flags?: Array<{ key: string; enabled_globally: boolean }>; flagUsers?: any[] } = {}) {
  const db: any = makeFakeSupabase({
    profiles: [
      { id: JULIO, is_beta_tester: true, beta_expires_at: null, subscription_tier: "pro" },
      { id: IOLANDA, is_beta_tester: true, beta_expires_at: null, subscription_tier: "pro" },
      { id: PEDRO, is_beta_tester: true, beta_expires_at: null, subscription_tier: "pro" },
      { id: TELMO, is_beta_tester: true, beta_expires_at: null, subscription_tier: "base", whatsapp_link_status: "linked" },
      { id: OTHER_BETA, is_beta_tester: true, beta_expires_at: null, subscription_tier: "base" },
      { id: ADMIN, is_beta_tester: false, subscription_tier: "base" },
      { id: GUEST, is_beta_tester: false, subscription_tier: "base" },
    ],
    user_roles: [{ user_id: JULIO, role: "super_admin" }, { user_id: ADMIN, role: "super_admin" }],
    pilots: [{ key: PILOT_KEY, status: opts.pilotStatus ?? "no_go", invite_issuer_user_id: JULIO, invite_cap: 2, invite_ttl_days: 7 }],
    pilot_participants: [
      { pilot_key: PILOT_KEY, user_id: JULIO, status: "active", source: "seed" },
      { pilot_key: PILOT_KEY, user_id: IOLANDA, status: "active", source: "seed" },
      { pilot_key: PILOT_KEY, user_id: PEDRO, status: "active", source: "seed" },
      { pilot_key: PILOT_KEY, user_id: TELMO, status: "excluded", source: "seed" },
    ],
    feature_flags: opts.flags ?? [],
    feature_flag_users: opts.flagUsers ?? [],
    access_invites: [],
    access_invite_attempts: [],
    account_access: [{ user_id: GUEST, state: "registered_waiting" }],
  });
  const t = (n: string) => (db.state[n] ??= []);
  const live = (r: any) => r.status === "used" || (r.status === "issued" && new Date(r.expires_at).getTime() > Date.now());
  db.rpc = async (fn: string, a: any) => {
    if (fn === "issue_pilot_invite") {
      const p = t("pilots").find((r: any) => r.key === a._pilot_key);
      if (!p) return { data: [{ out_invite_id: null, out_outcome: "no_pilot", out_remaining: 0 }], error: null };
      if (p.invite_issuer_user_id !== a._issuer) return { data: [{ out_invite_id: null, out_outcome: "not_issuer", out_remaining: 0 }], error: null };
      const n = t("access_invites").filter((r: any) => r.pilot_key === a._pilot_key && live(r)).length;
      if (a._idempotency_key) {
        const prev = t("access_invites").find((r: any) => r.issuer_user_id === a._issuer && r.idempotency_key === a._idempotency_key);
        if (prev) return { data: [{ out_invite_id: prev.id, out_outcome: "replayed", out_remaining: Math.max(p.invite_cap - n, 0) }], error: null };
      }
      if (p.status !== "go") return { data: [{ out_invite_id: null, out_outcome: "not_open", out_remaining: 0 }], error: null };
      if (n >= p.invite_cap) return { data: [{ out_invite_id: null, out_outcome: "cap_reached", out_remaining: 0 }], error: null };
      const id = `inv-${t("access_invites").length + 1}`;
      t("access_invites").push({ id, token_hash: a._token_hash, issuer_user_id: a._issuer, source: "pilot", pilot_key: a._pilot_key,
        idempotency_key: a._idempotency_key, status: "issued", expires_at: new Date(Date.now() + p.invite_ttl_days * DAY).toISOString(),
        created_at: new Date().toISOString() });
      return { data: [{ out_invite_id: id, out_outcome: "issued", out_remaining: p.invite_cap - n - 1 }], error: null };
    }
    if (fn === "issue_referral_invite") {
      const p = t("profiles").find((r: any) => r.id === a._issuer);
      if (!p?.is_beta_tester) return { data: null, error: null };
      const n = t("access_invites").filter((r: any) => r.issuer_user_id === a._issuer && r.source === "beta_tester" && live(r)).length;
      if (n >= a._quota) return { data: null, error: null };
      const id = `inv-${t("access_invites").length + 1}`;
      t("access_invites").push({ id, token_hash: a._token_hash, issuer_user_id: a._issuer, source: "beta_tester",
        status: "issued", expires_at: new Date(Date.now() + a._ttl_days * DAY).toISOString(), created_at: new Date().toISOString() });
      return { data: id, error: null };
    }
    if (fn === "consume_access_invite") {
      const inv = t("access_invites").find((r: any) => r.token_hash === a._token_hash && r.status === "issued" &&
        new Date(r.expires_at).getTime() > Date.now() && r.issuer_user_id !== a._user_id);
      if (!inv) return { data: null, error: null };
      Object.assign(inv, { status: "used", used_by: a._user_id, used_channel: a._channel });
      const row = t("account_access").find((r: any) => r.user_id === a._user_id);
      if (row) Object.assign(row, { state: "activated", invite_id: inv.id });
      // gatilho access_invites_pilot_participant
      if (inv.pilot_key && !t("pilot_participants").some((r: any) => r.pilot_key === inv.pilot_key && r.user_id === a._user_id)) {
        t("pilot_participants").push({ pilot_key: inv.pilot_key, user_id: a._user_id, status: "active", source: "invite", invite_id: inv.id });
      }
      return { data: inv.id, error: null };
    }
    throw new Error(`rpc ${fn}`);
  };
  return db;
}

const codeOf = (reply: string | null) => /AF-[A-Z2-9-]{23}/.exec(reply ?? "")?.[0] ?? null;
const snapshot = (db: any) => JSON.stringify({ p: db.state.profiles, r: db.state.user_roles, f: db.state.feature_flag_users });

beforeEach(() => { __resetAccountFlagsForTests(); __resetCrossChannelStateForTests(); });
afterEach(() => { __resetAccountFlagsForTests(); __resetCrossChannelStateForTests(); });

describe("participação no piloto ≠ beta/plano/papel", () => {
  const allV2On = () => [...PILOT_GATED_FLAGS].map((key) => ({ key, enabled_globally: true }));

  it("interruptor do piloto desligado: tudo como antes (Telmo, beta, continua com as funções ligadas para ele)", async () => {
    const db = makeDb({ flags: [{ key: ACTION_FIRST, enabled_globally: false }, { key: PILOT_ENTITLEMENT_FLAG, enabled_globally: false }],
      flagUsers: [{ flag_key: ACTION_FIRST, user_id: TELMO }] });
    expect(await isAccountFlagEnabled(db, ACTION_FIRST, TELMO)).toBe(true);
  });

  it("interruptor ligado: Telmo fica sem TODAS as funções 2.0, por qualquer caminho de leitura", async () => {
    const db = makeDb({ flags: [...allV2On(), { key: PILOT_ENTITLEMENT_FLAG, enabled_globally: true }] });
    for (const key of PILOT_GATED_FLAGS) expect(await isAccountFlagEnabled(db, key, TELMO)).toBe(false);
    expect(await isOpportunityNudgesEnabled(db, TELMO)).toBe(false);
    expect(await isCrossChannelEnabled(db, TELMO)).toBe(false);
  });

  it("interruptor ligado: Júlio, Iolanda e Pedro Cunha têm as funções 2.0", async () => {
    const db = makeDb({ flags: [...allV2On(), { key: PILOT_ENTITLEMENT_FLAG, enabled_globally: true }] });
    for (const u of [JULIO, IOLANDA, PEDRO]) {
      for (const key of PILOT_GATED_FLAGS) expect(await isAccountFlagEnabled(db, key, u)).toBe(true);
      expect(await isOpportunityNudgesEnabled(db, u)).toBe(true);
      expect(await isCrossChannelEnabled(db, u)).toBe(true);
    }
  });

  it("ser participante não liga uma função desligada (cada interruptor continua a ser o kill switch)", async () => {
    const db = makeDb({ flags: [{ key: ACTION_FIRST, enabled_globally: false }, { key: PILOT_ENTITLEMENT_FLAG, enabled_globally: true }] });
    expect(await isAccountFlagEnabled(db, ACTION_FIRST, IOLANDA)).toBe(false);
  });

  it("beta sem participação e super_admin sem participação não entram (o papel não dá direito ao piloto)", async () => {
    const db = makeDb({ flags: [...allV2On(), { key: PILOT_ENTITLEMENT_FLAG, enabled_globally: true }] });
    expect(await isAccountFlagEnabled(db, ACTION_FIRST, OTHER_BETA)).toBe(false);
    expect(await isAccountFlagEnabled(db, ACTION_FIRST, ADMIN)).toBe(false);
    // Linha por conta também não fura o piloto.
    db.state.feature_flag_users.push({ flag_key: ACTION_FIRST, user_id: TELMO });
    expect(await isAccountFlagEnabled(db, ACTION_FIRST, TELMO)).toBe(false);
  });

  it("funções fora do piloto (motor v3, teto de avisos, acesso antecipado) não mudam para o Telmo", async () => {
    const keys = ["assessor.engine.v3", "assessor.global_unsolicited_cap.v1", EARLY_ACCESS_GATE_FLAG];
    const db = makeDb({ flags: [...keys.map((key) => ({ key, enabled_globally: true })), { key: PILOT_ENTITLEMENT_FLAG, enabled_globally: true }] });
    for (const k of keys) expect(await isAccountFlagEnabled(db, k, TELMO)).toBe(true);
  });

  it("piloto fechado ou erro de leitura = ninguém tem as funções 2.0 (falha fechada)", async () => {
    const closed = makeDb({ pilotStatus: "closed" });
    expect(await isPilotParticipant(closed, IOLANDA)).toBe(false);
    const broken: any = makeDb();
    broken.from = () => { throw new Error("down"); };
    expect(await isPilotParticipant(broken, IOLANDA)).toBe(false);
    expect(await isPilotParticipant(makeDb(), null)).toBe(false);
  });

  it("Telmo mantém beta, plano, WhatsApp e acesso: nada disto é escrito e o acesso antecipado continua a deixá-lo entrar", async () => {
    const db = makeDb({ flags: [...allV2On(), { key: PILOT_ENTITLEMENT_FLAG, enabled_globally: true }, { key: EARLY_ACCESS_GATE_FLAG, enabled_globally: true }] });
    const before = snapshot(db);
    await isAccountFlagEnabled(db, ACTION_FIRST, TELMO);
    await isPilotParticipant(db, TELMO);
    expect((await resolveAccess(db, TELMO)).blocked).toBe(false);
    expect(snapshot(db)).toBe(before);
    const telmo = db.state.profiles.find((p: any) => p.id === TELMO);
    expect(telmo).toMatchObject({ is_beta_tester: true, subscription_tier: "base", whatsapp_link_status: "linked" });
  });
});

describe("convites do piloto: 2, só do Júlio, 7 dias, uso único", () => {
  beforeEach(() => { __setAccountFlagForTests(PILOT_INVITES_FLAG, JULIO, true); });

  it("piloto em NO-GO: a base de dados recusa e não fica nenhum convite", async () => {
    const db = makeDb({ pilotStatus: "no_go" });
    expect(await handleReferralCommand(db, JULIO, "dá-me um convite", { idempotencyKey: "whatsapp:m1" })).toBe(PILOT_NOT_OPEN_REPLY);
    expect(db.state.access_invites).toHaveLength(0);
  });

  it("piloto em GO: 2 convites de 7 dias e o 3.º é recusado", async () => {
    const db = makeDb({ pilotStatus: "go" });
    const r1 = await handleReferralCommand(db, JULIO, "dá-me um convite", { idempotencyKey: "whatsapp:m1" });
    const r2 = await handleReferralCommand(db, JULIO, "dá-me um convite", { idempotencyKey: "whatsapp:m2" });
    const r3 = await handleReferralCommand(db, JULIO, "dá-me um convite", { idempotencyKey: "whatsapp:m3" });
    expect(codeOf(r1)).not.toBeNull();
    expect(r1).toContain("Fica 1 por usar");
    expect(r2).toContain("Era o último convite do piloto");
    expect(r3).toBe(PILOT_CAP_REPLY);
    expect(db.state.access_invites).toHaveLength(2);
    for (const inv of db.state.access_invites) {
      expect(inv).toMatchObject({ source: "pilot", pilot_key: PILOT_KEY, issuer_user_id: JULIO });
      const days = (new Date(inv.expires_at).getTime() - Date.now()) / DAY;
      expect(days).toBeGreaterThan(6.99);
      expect(days).toBeLessThanOrEqual(7);
    }
  });

  it("a mesma mensagem repetida (reentrega do canal) não gera um segundo convite", async () => {
    const db = makeDb({ pilotStatus: "go" });
    await handleReferralCommand(db, JULIO, "dá-me um convite", { idempotencyKey: "telegram:telegram_42" });
    expect(await handleReferralCommand(db, JULIO, "dá-me um convite", { idempotencyKey: "telegram:telegram_42" })).toBe(PILOT_REPLAYED_REPLY);
    expect(db.state.access_invites).toHaveLength(1);
  });

  it("5 pedidos em simultâneo: só 2 convites", async () => {
    const db = makeDb({ pilotStatus: "go" });
    await Promise.all([1, 2, 3, 4, 5].map((i) => handleReferralCommand(db, JULIO, "dá-me um convite", { idempotencyKey: `whatsapp:p${i}` })));
    expect(db.state.access_invites.filter((r: any) => r.pilot_key === PILOT_KEY)).toHaveLength(2);
  });

  it("Iolanda e Pedro Cunha não emitem convites do piloto, mesmo com o interruptor ligado para eles", async () => {
    __setAccountFlagForTests(PILOT_INVITES_FLAG, IOLANDA, true);
    const db = makeDb({ pilotStatus: "go" });
    expect(await handleReferralCommand(db, IOLANDA, "dá-me um convite")).toBeNull();
    expect(await handleReferralCommand(db, PEDRO, "dá-me um convite")).toBeNull();
    expect(db.state.access_invites).toHaveLength(0);
  });

  it("a quota geral de beta continua 3 e não é consumida pelos convites do piloto", async () => {
    expect(REFERRAL_QUOTA).toBe(3);
    __setAccountFlagForTests(REFERRAL_INVITES_FLAG, OTHER_BETA, true);
    const db = makeDb({ pilotStatus: "go" });
    await handleReferralCommand(db, JULIO, "dá-me um convite", { idempotencyKey: "a" });
    await handleReferralCommand(db, JULIO, "dá-me um convite", { idempotencyKey: "b" });
    for (let i = 0; i < 3; i++) expect(codeOf(await handleReferralCommand(db, OTHER_BETA, "dá-me um convite"))).not.toBeNull();
    expect(db.state.access_invites.filter((r: any) => r.source === "beta_tester")).toHaveLength(3);
    expect(db.state.access_invites.filter((r: any) => r.source === "pilot")).toHaveLength(2);
  });

  it("convite expirado sem uso ou anulado liberta o lugar; usado não", async () => {
    const db = makeDb({ pilotStatus: "go" });
    const c1 = codeOf(await handleReferralCommand(db, JULIO, "dá-me um convite", { idempotencyKey: "a" }))!;
    await handleReferralCommand(db, JULIO, "dá-me um convite", { idempotencyKey: "b" });
    db.state.access_invites[1].expires_at = new Date(Date.now() - 1000).toISOString();
    expect(codeOf(await handleReferralCommand(db, JULIO, "dá-me um convite", { idempotencyKey: "c" }))).not.toBeNull();
    expect(await handleReferralCommand(db, JULIO, `anula o convite ${c1}`)).toContain("anulado");
    // c1 anulado => lugar livre
    expect(codeOf(await handleReferralCommand(db, JULIO, "dá-me um convite", { idempotencyKey: "d" }))).not.toBeNull();
    expect(await handleReferralCommand(db, JULIO, "dá-me um convite", { idempotencyKey: "e" })).toBe(PILOT_CAP_REPLY);
  });

  it("o convidado que usa o código entra no piloto; o código não serve uma segunda vez", async () => {
    __setAccountFlagForTests(EARLY_ACCESS_GATE_FLAG, "*", true);
    const db = makeDb({ pilotStatus: "go", flags: [{ key: ACTION_FIRST, enabled_globally: true }, { key: PILOT_ENTITLEMENT_FLAG, enabled_globally: true }] });
    const code = codeOf(await handleReferralCommand(db, JULIO, "dá-me um convite", { idempotencyKey: "a" }))!;
    expect(await isAccountFlagEnabled(db, ACTION_FIRST, GUEST)).toBe(false);
    expect((await handleBlockedInbound(db, GUEST, "whatsapp", code)).kind).toBe("invite_accepted");
    expect(await isAccountFlagEnabled(db, ACTION_FIRST, GUEST)).toBe(true);
    // A mesma pessoa ou outra não volta a usar o código.
    db.state.account_access.push({ user_id: "00000000-0000-0000-0000-0000000000g2", state: "registered_waiting" });
    expect((await handleBlockedInbound(db, "00000000-0000-0000-0000-0000000000g2", "telegram", code)).kind).toBe("invite_invalid");
    expect(db.state.access_invites.find((r: any) => r.token_hash === undefined)).toBeUndefined();
    expect(db.state.access_invites[0].token_hash).toBe(await hashInviteCode(code));
  });

  it("\"os meus convites\" mostra os convites do piloto ao Júlio", async () => {
    const db = makeDb({ pilotStatus: "go" });
    await handleReferralCommand(db, JULIO, "dá-me um convite", { idempotencyKey: "a" });
    const r = await handleReferralCommand(db, JULIO, "os meus convites");
    expect(r).toContain("Convite do piloto");
    expect(r).toContain("Podes gerar mais 1");
  });
});
