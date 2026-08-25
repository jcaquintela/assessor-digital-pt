// Leitura pura dos parâmetros com que o gateway devolve o consentimento.
// Isolada aqui para poder ser testada sem browser.

export type OAuthReturnAction =
  | { kind: "exchange"; code: string }
  | { kind: "done" }
  | { kind: "error"; message: string };

export function readOAuthReturn(search: string): OAuthReturnAction {
  const params = new URLSearchParams(search);
  if (params.get("success") !== "true") {
    return { kind: "error", message: params.get("error") ?? "A autorização não foi concluída." };
  }
  const code = params.get("code");
  if (code) return { kind: "exchange", code };
  // Cliente sem acesso offline: não há código para trocar, mas ficou ligado.
  if (params.get("offline_access_allowed") === "false") return { kind: "done" };
  return { kind: "error", message: "A autorização terminou sem código de troca." };
}

/** Tempo até assumirmos que a janela não fecha sozinha (sem `opener`). */
export const SELF_CLOSE_GRACE_MS = 600;
/** Tempo até avisarmos que está a demorar, em vez de spinner infinito. */
export const SLOW_HINT_MS = 8_000;
/** Tempo até reencaminhar sozinho quando a janela não fecha. */
export const REDIRECT_DELAY_MS = 1_500;
