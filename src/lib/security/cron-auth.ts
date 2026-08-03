// Autenticação dos endpoints internos de cron (/api/public/hooks/*).
//
// Segredo partilhado exclusivamente entre o pg_cron e o servidor (CRON_SECRET).
// NUNCA usar a chave publicável/anon: essa vai no bundle do browser e qualquer
// visitante poderia disparar estes trabalhos.

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Devolve `null` quando autorizado, ou uma Response 401/503 a devolver já. */
export function requireCronSecret(request: Request): Response | null {
  const expected = (process.env['CRON_SECRET'] ?? "").trim();
  if (!expected) {
    return new Response(JSON.stringify({ ok: false, error: "cron_secret_not_configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  const provided = (
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    ""
  ).trim();
  if (!provided || !timingSafeEqual(provided, expected)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}