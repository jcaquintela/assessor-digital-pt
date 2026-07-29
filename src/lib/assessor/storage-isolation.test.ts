// End-to-end tenant isolation test for the `assessor-files` bucket.
//
// Uses two REAL Supabase accounts (email/password) provided via env vars.
// Verifies that account B — with its own valid JWT — cannot list, read or
// delete files owned by account A, even when B knows A's storage path.
//
// Required env vars (provide in CI as secrets):
//   TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY,
//   TEST_USER_A_EMAIL, TEST_USER_A_PASSWORD,
//   TEST_USER_B_EMAIL, TEST_USER_B_PASSWORD
//
// Accounts must be pre-created and email-confirmed (mailer_autoconfirm is
// off in production). If any var is missing the suite is skipped so local
// runs don't fail; CI must set them so regressions are caught.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.TEST_SUPABASE_URL;
const anon = process.env.TEST_SUPABASE_ANON_KEY;
const aEmail = process.env.TEST_USER_A_EMAIL;
const aPass = process.env.TEST_USER_A_PASSWORD;
const bEmail = process.env.TEST_USER_B_EMAIL;
const bPass = process.env.TEST_USER_B_PASSWORD;

const hasEnv = Boolean(url && anon && aEmail && aPass && bEmail && bPass);
const d = hasEnv ? describe : describe.skip;

const BUCKET = "assessor-files";

function newClient(): SupabaseClient {
  return createClient(url!, anon!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(email: string, password: string) {
  const client = newClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return { client, userId: data.user!.id };
}

d("assessor-files bucket cross-tenant isolation (real JWTs)", () => {
  let a: { client: SupabaseClient; userId: string };
  let b: { client: SupabaseClient; userId: string };
  let aPath: string;

  beforeAll(async () => {
    a = await signIn(aEmail!, aPass!);
    b = await signIn(bEmail!, bPass!);
    expect(a.userId).not.toBe(b.userId);

    aPath = `${a.userId}/isolation-test/${crypto.randomUUID()}.txt`;
    const body = new TextEncoder().encode("secret-from-A");
    const up = await a.client.storage
      .from(BUCKET)
      .upload(aPath, body, { contentType: "text/plain", upsert: false });
    if (up.error) throw new Error(`A upload failed: ${up.error.message}`);
  }, 30_000);

  afterAll(async () => {
    try {
      if (a && aPath) await a.client.storage.from(BUCKET).remove([aPath]);
    } catch {}
    try {
      await a?.client.auth.signOut();
      await b?.client.auth.signOut();
    } catch {}
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
    const res = await b.client.storage.from(BUCKET).createSignedUrl(aPath, 60);
    // eslint-disable-next-line no-console
    console.log("[isolation] B signed URL for A path:", { error: res.error?.message, hasUrl: Boolean(res.data?.signedUrl) });
    expect(res.data?.signedUrl).toBeFalsy();
    expect(res.error).toBeTruthy();
  });

  it("B cannot download A's file via storage.download", async () => {
    const res = await b.client.storage.from(BUCKET).download(aPath);
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
    const check = await a.client.storage.from(BUCKET).createSignedUrl(aPath, 60);
    expect(check.error).toBeFalsy();
    expect(check.data?.signedUrl).toBeTruthy();
  });

  it("B cannot see A's rows in uploaded_files via RLS", async () => {
    // Not all uploads land in uploaded_files (only the pipeline writes there),
    // but the query itself must be scoped to B — never return A's rows.
    const res = await b.client
      .from("uploaded_files")
      .select("id, user_id, storage_path")
      .eq("user_id", a.userId)
      .limit(10);
    // eslint-disable-next-line no-console
    console.log("[isolation] B query uploaded_files where user_id=A:", { error: res.error?.message, count: res.data?.length ?? 0 });
    expect(res.error).toBeFalsy();
    expect(res.data ?? []).toHaveLength(0);
  });
});