import { createMiddleware } from "@tanstack/react-start";
import { readSupportMode } from "./support-mode";

// Enquanto o admin está em modo suporte, cada ação feita na app fica registada
// na auditoria como "admin agiu em nome de [utilizador]".
const SKIP = ["logSupportAction", "endSupportSession", "startSupportSession"];

export const auditSupportActions = createMiddleware({ type: "function" }).client(
  async ({ next, ...ctx }: any) => {
    const result = await next();
    try {
      const state = readSupportMode();
      if (!state) return result;
      const id = String(ctx?.functionId ?? ctx?.filename ?? "acao");
      if (SKIP.some((s) => id.includes(s))) return result;
      if (ctx?.method && ctx.method !== "POST") return result;
      const { logSupportAction } = await import("./support-mode.functions");
      void logSupportAction({
        data: {
          session_id: state.sessionId,
          action: id.slice(0, 200),
          route: typeof window !== "undefined" ? window.location.pathname : undefined,
        },
      }).catch(() => null);
    } catch {
      /* auditoria nunca bloqueia a ação */
    }
    return result;
  },
);