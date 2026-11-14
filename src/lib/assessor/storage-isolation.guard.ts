// Barreira do teste E2E de isolamento do armazenamento.
//
// O teste cria contas, carrega e apaga ficheiros com sessões reais. Por isso só
// pode correr contra um backend de TESTE dedicado, nunca contra o da aplicação.
// Regras (todas obrigatórias):
//   1. ALLOW_REMOTE_STORAGE_ISOLATION_TEST=1 (opt-in explícito);
//   2. TEST_SUPABASE_URL e TEST_SUPABASE_PUBLISHABLE_KEY definidos — sem
//      recorrer às variáveis da aplicação (VITE_* / SUPABASE_*);
//   3. o URL de teste não pode ser o da aplicação nem conter a referência do
//      projeto da aplicação;
//   4. credenciais de serviço só via TEST_SUPABASE_SERVICE_ROLE_KEY.

export type IsolationTarget =
  | {
      enabled: true;
      url: string;
      anon: string;
      serviceKey: string | null;
      fixtures: { aEmail: string; aPass: string; bEmail: string; bPass: string } | null;
    }
  | { enabled: false; reason: string; misconfigured: boolean };

type Env = Record<string, string | undefined>;

function norm(u: string | undefined): string {
  return (u ?? "").trim().replace(/\/+$/, "").toLowerCase();
}

/** Barreira do teste E2E de armazenamento (opt-in ALLOW_REMOTE_STORAGE_ISOLATION_TEST). */
export function resolveIsolationTarget(env: Env): IsolationTarget {
  return resolveRemoteTestTarget(env, "ALLOW_REMOTE_STORAGE_ISOLATION_TEST");
}

/**
 * Barreira genérica para qualquer teste que escreva num backend real: exige o
 * opt-in `optInVar=1` e um backend de TESTE explícito, diferente do da app.
 */
export function resolveRemoteTestTarget(env: Env, optInVar: string): IsolationTarget {
  if (env[optInVar] !== "1") {
    return {
      enabled: false,
      misconfigured: false,
      reason: `desligado: falta ${optInVar}=1 (só para backend de teste dedicado)`,
    };
  }
  const url = env.TEST_SUPABASE_URL?.trim();
  const anon = (env.TEST_SUPABASE_PUBLISHABLE_KEY || env.TEST_SUPABASE_ANON_KEY)?.trim();
  if (!url || !anon) {
    return {
      enabled: false,
      misconfigured: true,
      reason: "recusado: TEST_SUPABASE_URL e TEST_SUPABASE_PUBLISHABLE_KEY têm de estar definidos explicitamente",
    };
  }
  const appUrls = [env.VITE_SUPABASE_URL, env.SUPABASE_URL].map(norm).filter(Boolean);
  const appRefs = [env.VITE_SUPABASE_PROJECT_ID, env.SUPABASE_PROJECT_ID, ...(env.ISOLATION_FORBIDDEN_REFS ?? "").split(",")]
    .map((r) => (r ?? "").trim().toLowerCase())
    .filter(Boolean);
  const target = norm(url);
  if (appUrls.includes(target) || appRefs.some((ref) => target.includes(ref))) {
    return {
      enabled: false,
      misconfigured: true,
      reason: "recusado: TEST_SUPABASE_URL aponta para o backend da aplicação",
    };
  }
  const serviceKey = env.TEST_SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
  const f = {
    aEmail: env.TEST_USER_A_EMAIL ?? "",
    aPass: env.TEST_USER_A_PASSWORD ?? "",
    bEmail: env.TEST_USER_B_EMAIL ?? "",
    bPass: env.TEST_USER_B_PASSWORD ?? "",
  };
  const fixtures = f.aEmail && f.aPass && f.bEmail && f.bPass ? f : null;
  if (!serviceKey && !fixtures) {
    return {
      enabled: false,
      misconfigured: true,
      reason: "recusado: falta TEST_SUPABASE_SERVICE_ROLE_KEY ou as contas TEST_USER_A_*/TEST_USER_B_*",
    };
  }
  return { enabled: true, url, anon, serviceKey, fixtures };
}
