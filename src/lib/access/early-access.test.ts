import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { __resetAccountFlagsForTests, __setAccountFlagForTests } from "@/lib/flags/account-flag.server";
import {
  EARLY_ACCESS_GATE_FLAG, REFERRAL_INVITES_FLAG, WAITLIST_FLAG, REFERRAL_QUOTA,
  extractInviteCode, generateInviteCode, hashInviteCode, parseReferralCommand,
  INVITE_ACCEPTED_REPLY, INVITE_INVALID_REPLY, INVITE_RATE_LIMIT_REPLY, WAITLIST_CONSENT_QUESTION,
  WAITLIST_JOINED_REPLY, REFERRAL_QUOTA_REPLY, REFERRAL_NOT_ELIGIBLE_REPLY,
} from "./early-access";
import {
  handleBlockedInbound, handleReferralCommand, resolveAccess, startTrialAfterActivation, trialBlockedByGate,
} from "./early-access.server";

const NEW = "00000000-0000-0000-0000-00000000000a";
const BETA = "00000000-0000-0000-0000-00000000000b";
const OLD = "00000000-0000-0000-0000-00000000000c";
const FUTURE = () => new Date(Date.now() + 7 * 864e5).toISOString();

/** Fake com as duas funções atómicas da base de dados, com a mesma semântica do SQL. */
function makeDb(extra: Record<string, any[]> = {}) {
  const db: any = makeFakeSupabase({
    profiles: [
      { id: NEW, is_beta_tester: false, subscription_tier: "base", trial_status: null },
      { id: BETA, is_beta_tester: true, beta_expires_at: null, subscription_tier: "hub", trial_status: null },
      { id: OLD, is_beta_tester: false, subscription_tier: "base", trial_status: null },
    ],
    account_access: [{ user_id: NEW, state: "registered_waiting" }],
    access_invites: [],
    access_invite_attempts: [],
    access_waitlist: [],
    ...extra,
  });
  const t = (n: string) => (db.state[n] ??= []);
  db.rpc = async (fn: string, a: any) => {
    if (fn === "consume_access_invite") {
      const inv = t("access_invites").find(
        (r: any) => r.token_hash === a._token_hash && r.status === "issued" &&
          new Date(r.expires_at).getTime() > Date.now() && r.issuer_user_id !== a._user_id,
      );
      if (!inv) return { data: null, error: null };
      Object.assign(inv, { status: "used", used_by: a._user_id, used_channel: a._channel, used_at: new Date().toISOString() });
      const row = t("account_access").find((r: any) => r.user_id === a._user_id);
      if (row && ["registered_waiting", "invited"].includes(row.state)) Object.assign(row, { state: "activated", invite_id: inv.id });
      if (!row) t("account_access").push({ user_id: a._user_id, state: "activated", invite_id: inv.id });
      return { data: inv.id, error: null };
    }
    if (fn === "issue_referral_invite") {
      const p = t("profiles").find((r: any) => r.id === a._issuer);
      if (!p?.is_beta_tester) return { data: null, error: null };
      const live = t("access_invites").filter((r: any) => r.issuer_user_id === a._issuer && r.source === "beta_tester" &&
        (r.status === "used" || (r.status === "issued" && new Date(r.expires_at).getTime() > Date.now()))).length;
      if (live >= a._quota) return { data: null, error: null };
      const id = `inv-${t("access_invites").length + 1}`;
      t("access_invites").push({ id, token_hash: a._token_hash, issuer_user_id: a._issuer, source: "beta_tester",
        status: "issued", expires_at: new Date(Date.now() + a._ttl_days * 864e5).toISOString(), created_at: new Date().toISOString() });
      return { data: id, error: null };
    }
    throw new Error(`rpc ${fn}`);
  };
  db.from = ((orig) => (name: string) => {
    const q = orig(name);
    q.upsert = (p: any) => { const rows = t(name); const i = rows.findIndex((r: any) => r.user_id === p.user_id);
      if (i >= 0) Object.assign(rows[i], p); else rows.push({ ...p }); return Promise.resolve({ data: null, error: null }); };
    return q;
  })(db.from);
  return db;
}

async function seedInvite(db: any, code: string, over: Record<string, any> = {}) {
  db.state.access_invites.push({ id: `inv-${db.state.access_invites.length + 1}`, token_hash: await hashInviteCode(code),
    source: "admin", issuer_user_id: null, status: "issued", expires_at: FUTURE(), ...over });
}

beforeEach(() => { __resetAccountFlagsForTests(); __setAccountFlagForTests(EARLY_ACCESS_GATE_FLAG, "*", true); });
afterEach(() => { __resetAccountFlagsForTests(); vi.restoreAllMocks(); });

describe("códigos de convite", () => {
  it("gera códigos únicos e reconhece-os em texto livre, com espaços ou minúsculas", () => {
    const a = generateInviteCode();
    expect(a).toMatch(/^AF-[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/);
    expect(new Set(Array.from({ length: 200 }, () => generateInviteCode())).size).toBe(200);
    expect(extractInviteCode(`olá, o meu código é ${a.toLowerCase().replace(/-/g, " ")}`)).toBe(a);
    expect(extractInviteCode("AF-12")).toBeNull();
    expect(extractInviteCode("Afonso marca reuniao amanha com a Joana")).toBeNull();
  });
  it("percebe os pedidos de convite do beta tester", () => {
    expect(parseReferralCommand("dá-me um convite")).toEqual({ kind: "issue" });
    expect(parseReferralCommand("os meus convites")).toEqual({ kind: "list" });
    expect(parseReferralCommand("anula o convite")).toEqual({ kind: "revoke", code: null });
    expect(parseReferralCommand("tenho reunião com o cliente")).toBeNull();
  });
});

describe("conta em espera", () => {
  it("interruptor desligado: ninguém fica bloqueado (rollback)", async () => {
    __setAccountFlagForTests(EARLY_ACCESS_GATE_FLAG, "*", false);
    expect((await resolveAccess(makeDb(), NEW)).blocked).toBe(false);
  });
  it("conta nova sem convite fica bloqueada; contas antigas e beta testers mantêm acesso", async () => {
    const db = makeDb({ account_access: [{ user_id: NEW, state: "registered_waiting" }, { user_id: BETA, state: "registered_waiting" }] });
    expect((await resolveAccess(db, NEW)).blocked).toBe(true);
    expect((await resolveAccess(db, OLD)).blocked).toBe(false);
    expect((await resolveAccess(db, BETA)).blocked).toBe(false);
  });
  it("'Olá Afonso' sem convite: explica early access e oferece lista de espera, sem trial", async () => {
    __setAccountFlagForTests(WAITLIST_FLAG, "*", true);
    const db = makeDb();
    const r = await handleBlockedInbound(db, NEW, "whatsapp", "Olá Afonso");
    expect(r.kind).toBe("early_access");
    expect(r.reply).toMatch(/acesso antecipado/);
    expect(r.reply).toMatch(/lista de espera/);
    expect(await trialBlockedByGate(db, NEW)).toBe(true);
  });
  it("código válido ativa a conta; o mesmo código não serve uma segunda vez", async () => {
    const db = makeDb({ account_access: [{ user_id: NEW, state: "registered_waiting" }, { user_id: OLD, state: "registered_waiting" }] });
    const code = generateInviteCode();
    await seedInvite(db, code);
    expect((await handleBlockedInbound(db, NEW, "telegram", code)).reply).toBe(INVITE_ACCEPTED_REPLY);
    expect(db.state.account_access.find((r: any) => r.user_id === NEW).state).toBe("activated");
    const second = await handleBlockedInbound(db, OLD, "whatsapp", code);
    expect(second.kind).toBe("invite_invalid");
  });
  it("duas pessoas a usar o mesmo código ao mesmo tempo: só uma entra", async () => {
    const db = makeDb({ account_access: [{ user_id: NEW, state: "registered_waiting" }, { user_id: OLD, state: "registered_waiting" }] });
    const code = generateInviteCode();
    await seedInvite(db, code);
    const rs = await Promise.all([handleBlockedInbound(db, NEW, "whatsapp", code), handleBlockedInbound(db, OLD, "telegram", code)]);
    expect(rs.filter((r) => r.kind === "invite_accepted")).toHaveLength(1);
  });
  it("expirado, anulado ou inventado: a mesma resposta neutra", async () => {
    __setAccountFlagForTests(WAITLIST_FLAG, "*", true);
    const db = makeDb();
    const exp = generateInviteCode(); const rev = generateInviteCode();
    await seedInvite(db, exp, { expires_at: new Date(Date.now() - 1000).toISOString() });
    await seedInvite(db, rev, { status: "revoked" });
    for (const c of [exp, rev, generateInviteCode()]) {
      expect((await handleBlockedInbound(db, NEW, "whatsapp", c)).reply).toBe(INVITE_INVALID_REPLY);
    }
  });
  it("quem deu o convite não o pode usar em si próprio", async () => {
    const db = makeDb({ account_access: [{ user_id: BETA, state: "registered_waiting" }] });
    db.state.profiles.find((p: any) => p.id === BETA).is_beta_tester = false;
    const code = generateInviteCode();
    await seedInvite(db, code, { issuer_user_id: BETA, source: "beta_tester" });
    expect((await handleBlockedInbound(db, BETA, "whatsapp", code)).kind).toBe("invite_invalid");
  });
  it("trava tentativas repetidas de códigos", async () => {
    const db = makeDb();
    for (let i = 0; i < 5; i++) await handleBlockedInbound(db, NEW, "whatsapp", generateInviteCode());
    const code = generateInviteCode(); await seedInvite(db, code);
    expect((await handleBlockedInbound(db, NEW, "whatsapp", code)).reply).toBe(INVITE_RATE_LIMIT_REPLY);
  });
  it("lista de espera só regista depois de um 'sim' explícito", async () => {
    __setAccountFlagForTests(WAITLIST_FLAG, "*", true);
    const db = makeDb();
    expect((await handleBlockedInbound(db, NEW, "whatsapp", "sim")).kind).toBe("early_access");
    expect(db.state.access_waitlist).toHaveLength(0);
    expect((await handleBlockedInbound(db, NEW, "whatsapp", "quero entrar na lista de espera")).reply).toBe(WAITLIST_CONSENT_QUESTION);
    expect((await handleBlockedInbound(db, NEW, "whatsapp", "sim")).reply).toBe(WAITLIST_JOINED_REPLY);
    expect(db.state.access_waitlist[0]).toMatchObject({ user_id: NEW, consent_contact: true, status: "waiting" });
    await handleBlockedInbound(db, NEW, "whatsapp", "sair da lista");
    expect(db.state.access_waitlist[0]).toMatchObject({ status: "removed", consent_contact: false });
  });
});

describe("trial de 14 dias", () => {
  it("só arranca uma vez, na primeira mensagem depois da ativação", async () => {
    const db = makeDb({ account_access: [{ user_id: NEW, state: "activated" }] });
    const trial = await import("@/lib/subscription/trial.server");
    const spy = vi.spyOn(trial, "startTrialForChannelChoice").mockResolvedValue({ started: true, alreadyActive: false });
    const row = { user_id: NEW, state: "activated", activated_at: null, trial_started_at: null, waitlist_offered_at: null };
    await Promise.all([startTrialAfterActivation(db, NEW, row), startTrialAfterActivation(db, NEW, { ...row })]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![2]).toEqual({ viaInvite: true });
    expect(db.state.account_access[0].state).toBe("trialing");
  });
  it("conta ativada não ganha trial por outro caminho (QR, escolha de canal)", async () => {
    const db = makeDb({ account_access: [{ user_id: NEW, state: "activated" }] });
    expect(await trialBlockedByGate(db, NEW)).toBe(true);
    expect(await trialBlockedByGate(db, OLD)).toBe(false);
  });
});

describe("convites dados por beta testers", () => {
  beforeEach(() => __setAccountFlagForTests(REFERRAL_INVITES_FLAG, "*", true));
  it("dá 3 convites e recusa o quarto, mesmo pedidos em paralelo", async () => {
    const db = makeDb();
    const rs = await Promise.all(Array.from({ length: 5 }, () => handleReferralCommand(db, BETA, "dá-me um convite")));
    expect(rs.filter((r) => r?.includes("AF-"))).toHaveLength(REFERRAL_QUOTA);
    expect(rs.filter((r) => r === REFERRAL_QUOTA_REPLY)).toHaveLength(2);
  });
  it("quem não é beta tester não gera convites", async () => {
    expect(await handleReferralCommand(makeDb(), OLD, "dá-me um convite")).toBe(REFERRAL_NOT_ELIGIBLE_REPLY);
  });
  it("anular um convite devolve-o à quota e o código deixa de servir", async () => {
    const db = makeDb();
    const r = (await handleReferralCommand(db, BETA, "dá-me um convite"))!;
    const code = extractInviteCode(r)!;
    await handleReferralCommand(db, BETA, `anula o convite ${code}`);
    expect((await handleBlockedInbound(db, NEW, "whatsapp", code)).kind).toBe("invite_invalid");
    expect(await handleReferralCommand(db, BETA, "os meus convites")).toMatch(/anulado[\s\S]*Podes gerar mais 3/);
  });
  it("o convite guarda quem o deu (para medir indicações)", async () => {
    const db = makeDb();
    const code = extractInviteCode((await handleReferralCommand(db, BETA, "dá-me um convite"))!)!;
    await handleBlockedInbound(db, NEW, "telegram", code);
    expect(db.state.access_invites[0]).toMatchObject({ issuer_user_id: BETA, used_by: NEW, used_channel: "telegram" });
  });
  it("interruptor desligado: o pedido segue para o Afonso normal", async () => {
    __setAccountFlagForTests(REFERRAL_INVITES_FLAG, "*", false);
    expect(await handleReferralCommand(makeDb(), BETA, "dá-me um convite")).toBeNull();
  });
});
