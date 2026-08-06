import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({ token: z.string().min(10).max(200) });

// Público por natureza: recebe o token de uso único vindo do link enviado pelo
// Afonso e devolve o token_hash que o browser troca por sessão.
export const redeemLoginLink = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const { redeemDashboardLoginToken } = await import("./dashboard-login.server");
    const r = await redeemDashboardLoginToken(data.token);
    if (!r.ok) return { ok: false as const, reason: r.reason };
    return { ok: true as const, email: r.email, tokenHash: r.tokenHash };
  });

// Recuperação directa no ecrã de erro: reenvia um link novo pelo canal em que
// o consultor já fala com o Afonso.
export const requestNewLoginLink = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const { reissueLoginLinkFromToken } = await import("./dashboard-login.server");
    const r = await reissueLoginLinkFromToken(data.token);
    if (!r.ok) return { ok: false as const, reason: r.reason };
    return { ok: true as const, channel: r.channel };
  });