// End-to-end tenant isolation test for the `assessor-files` bucket.
//
// Two REAL accounts sign in with email/password and get real JWTs. Account B
// must never be able to list, read or delete files owned by account A, even
// knowing A's exact storage path.
//
// Credentials: the suite provisions two throwaway accounts with the service
// role key and deletes them afterwards, so it can never break because someone
// rotated a shared test password or deleted a fixture account. If no service
// role key is available it falls back to pre-created accounts from
// TEST_USER_A_* / TEST_USER_B_*.
//
// Env vars (CI secrets):
//   TEST_SUPABASE_URL              (falls back to SUPABASE_URL / VITE_SUPABASE_URL)
//   TEST_SUPABASE_PUBLISHABLE_KEY  (falls back to TEST_SUPABASE_ANON_KEY /
//                                   SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_PUBLISHABLE_KEY)
//   TEST_SUPABASE_SERVICE_ROLE_KEY (falls back to SUPABASE_SERVICE_ROLE_KEY)
//   TEST_USER_A_EMAIL/PASSWORD, TEST_USER_B_EMAIL/PASSWORD (only without service key)
//
// Locally the suite skips when nothing is configured. In CI (process.env.CI)
// it fails loudly instead of silently skipping.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url =
  process.env.TEST_SUPABASE_URL || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
// Publishable (`sb_publishable_…`) keys are the current format; the legacy
// `anon` JWT stops working once a project migrates to asymmetric signing keys,
// which is exactly how this suite broke before. Accept either name.
const anon =
  process.env.TEST_SUPABASE_PUBLISHABLE_KEY ||
  process.env.TEST_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const serviceKey =
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const aEmail = process.env.TEST_USER_A_EMAIL;
const aPass = process.env.TEST_USER_A_PASSWORD;
const bEmail = process.env.TEST_USER_B_EMAIL;
const bPass = process.env.TEST_USER_B_PASSWORD;

const canProvision = Boolean(url && anon && serviceKey);
const hasFixtures = Boolean(url && anon && aEmail && aPass && bEmail && bPass);
const hasEnv = canProvision || hasFixtures;

if (!hasEnv && process.env.CI) {
  throw new Error(
    "storage-isolation: falta configuração. Define TEST_SUPABASE_URL + " +
      "TEST_SUPABASE_PUBLISHABLE_KEY e (TEST_SUPABASE_SERVICE_ROLE_KEY ou as contas TEST_USER_*).",
  );
}

const d = hasEnv ? describe : describe.skip;

const BUCKET = "assessor-files";

// ---------------------------------------------------------------------------
// Resiliência contra instabilidade transitória do serviço remoto (5xx / rede).
// O CI falhava com "Unexpected HTTP response: 503" quando o Auth/Storage
// remoto respondia 503 durante o arranque. Isto não é falha de isolamento.
// ---------------------------------------------------------------------------

const RETRIES = 3;
const BASE_DELAY_MS = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isTransient(message: string | undefined | null): boolean {
  if (!message) return false;
  return /\b(50[0-4]|429)\b|unexpected http response|fetch failed|network|timeout|ECONNRESET|EAI_AGAIN|socket hang up/i.test(
    message,
  );
}

/** Repete `fn` com backoff exponencial apenas em erros transitórios (5xx/429/rede). */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === RETRIES || !isTransient(msg)) throw err;
      // eslint-disable-next-line no-console
      console.warn(`[isolation] ${label} falhou (tentativa ${attempt}/${RETRIES}): ${msg} — a repetir…`);
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
  throw lastErr;
}

/** fetch com retry em 5xx/429. */
async function fetchWithRetry(label: string, input: string, init: RequestInit): Promise<Response> {
  return withRetry(label, async () => {
    const res = await fetch(input, init);
    if (res.status >= 500 || res.status === 429) {
      throw new Error(`Unexpected HTTP response: ${res.status} (${label})`);
    }
    return res;
  });
}

/** Espera que o projeto remoto responda antes de correr os testes. */
async function waitForService() {
  const deadline = Date.now() + 90_000;
  let lastStatus = "sem resposta";
  let delay = 1000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anon! } });
      if (res.ok) return;
      lastStatus = `HTTP ${res.status}`;
    } catch (err) {
      lastStatus = err instanceof Error ? err.message : String(err);
    }
    // eslint-disable-next-line no-console
    console.warn(`[isolation] serviço ainda não pronto (${lastStatus}) — nova tentativa em ${delay}ms`);
    await sleep(delay);
    delay = Math.min(delay * 2, 10_000);
  }
  throw new Error(`serviço remoto indisponível após 90s (último estado: ${lastStatus})`);
}

function newClient(): SupabaseClient {
  return createClient(url!, anon!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function adminHeaders() {
  return {
    apikey: serviceKey!,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
}

/** Cria uma conta descartável já confirmada e devolve as credenciais. */
async function provisionUser(tag: string) {
  const email = `ci-isolation-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.assessor.local`;
  const password = `Ci!${crypto.randomUUID()}`;
  const res = await fetchWithRetry(`provisionar conta ${tag}`, `${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!res.ok) {
    throw new Error(`provisionamento da conta ${tag} falhou [${res.status}]: ${await res.text()}`);
  }
  return { email, password };
}

async function deleteUser(userId: string) {
  if (!serviceKey) return;
  await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
}

async function signIn(email: string, password: string) {
  return withRetry(`sign-in ${email}`, async () => {
    const client = newClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      throw new Error(`sign-in failed for ${email}: ${error?.message ?? "sem sessão devolvida"}`);
    }
    return { client, userId: data.user!.id };
  });
}

d("assessor-files bucket cross-tenant isolation (real JWTs)", () => {
  let a: { client: SupabaseClient; userId: string };
  let b: { client: SupabaseClient; userId: string };
  let aPath: string;
  let provisioned = false;

  beforeAll(async () => {
    await waitForService();
    if (canProvision) {
      const [ca, cb] = await Promise.all([provisionUser("a"), provisionUser("b")]);
      provisioned = true;
      a = await signIn(ca.email, ca.password);
      b = await signIn(cb.email, cb.password);
    } else {
      a = await signIn(aEmail!, aPass!);
      b = await signIn(bEmail!, bPass!);
    }
    expect(a.userId).not.toBe(b.userId);

    aPath = `${a.userId}/isolation-test/${crypto.randomUUID()}.txt`;
    const body = new TextEncoder().encode("secret-from-A");
    await withRetry("upload de A", async () => {
      const up = await a.client.storage
        .from(BUCKET)
        .upload(aPath, body, { contentType: "text/plain", upsert: true });
      if (up.error) throw new Error(`A upload failed: ${up.error.message}`);
    });
  }, 180_000);

  afterAll(async () => {
    try {
      if (a && aPath) await a.client.storage.from(BUCKET).remove([aPath]);
    } catch {}
    try {
      await a?.client.auth.signOut();
      await b?.client.auth.signOut();
    } catch {}
    if (provisioned) {
      try {
        if (a?.userId) await deleteUser(a.userId);
        if (b?.userId) await deleteUser(b.userId);
      } catch {}
    }
  });

  it("B cannot list A's prefix via storage.list", async () => {
    const res = await b.client.storage.from(BUCKET).list(`${a.userId}/isolation-test`);
    // Cross-tenant list must either error or return no rows — never expose A's object.
    const rows = res.data ?? [];
    const leaked = rows.some((r) => aPath.endsWith(r.name));
    // eslint-disable-next-line no-console
    console.log("[isolation] B list A prefix:", { error: res.error?.message, count: rows.length, leaked });
    expect(leaked).toBe(false);
  });

  it("B cannot generate a signed URL for A's exact path", async () => {
    const res = await withRetry("B signed URL", async () => {
      const r = await b.client.storage.from(BUCKET).createSignedUrl(aPath, 60);
      if (isTransient(r.error?.message)) throw new Error(r.error!.message);
      return r;
    });
    // eslint-disable-next-line no-console
    console.log("[isolation] B signed URL for A path:", { error: res.error?.message, hasUrl: Boolean(res.data?.signedUrl) });
    expect(res.data?.signedUrl).toBeFalsy();
    expect(res.error).toBeTruthy();
  });

  it("B cannot download A's file via storage.download", async () => {
    const res = await withRetry("B download", async () => {
      const r = await b.client.storage.from(BUCKET).download(aPath);
      if (isTransient(r.error?.message)) throw new Error(r.error!.message);
      return r;
    });
    // eslint-disable-next-line no-console
    console.log("[isolation] B download A path:", { error: res.error?.message, hasBlob: Boolean(res.data) });
    expect(res.data).toBeFalsy();
    expect(res.error).toBeTruthy();
  });

  it("B cannot delete A's file via storage.remove", async () => {
    const res = await b.client.storage.from(BUCKET).remove([aPath]);
    const removed = (res.data ?? []).some((r: any) => r?.name === aPath);
    // eslint-disable-next-line no-console
    console.log("[isolation] B remove A path:", { error: res.error?.message, removed, returned: res.data });
    expect(removed).toBe(false);

    // Confirm from A's side that the file still exists.
    const check = await withRetry("A signed URL (verificação)", async () => {
      const r = await a.client.storage.from(BUCKET).createSignedUrl(aPath, 60);
      if (isTransient(r.error?.message)) throw new Error(r.error!.message);
      return r;
    });
    expect(check.error).toBeFalsy();
    expect(check.data?.signedUrl).toBeTruthy();
  });

  it("B cannot see A's rows in uploaded_files via RLS", async () => {
    // Not all uploads land in uploaded_files (only the pipeline writes there),
    // but the query itself must be scoped to B — never return A's rows.
    const res = await withRetry("B query uploaded_files", async () => {
      const r = await b.client
        .from("uploaded_files")
        .select("id, user_id, storage_path")
        .eq("user_id", a.userId)
        .limit(10);
      if (isTransient(r.error?.message)) throw new Error(r.error!.message);
      return r;
    });
    // eslint-disable-next-line no-console
    console.log("[isolation] B query uploaded_files where user_id=A:", { error: res.error?.message, count: res.data?.length ?? 0 });
    expect(res.error).toBeFalsy();
    expect(res.data ?? []).toHaveLength(0);
  });
});