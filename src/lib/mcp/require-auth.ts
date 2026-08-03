import type { ToolContext } from "@lovable.dev/mcp-js";

/** Resultado de erro quando não há sessão OAuth verificada. */
export const NOT_AUTHENTICATED = {
  content: [
    {
      type: "text" as const,
      text: "Sessão necessária: liga-te com a tua conta do Afonso para aceder a estes dados.",
    },
  ],
  isError: true as const,
};

export function isSignedIn(ctx: ToolContext | undefined): boolean {
  return Boolean(ctx?.isAuthenticated?.() && ctx?.getUserId?.());
}