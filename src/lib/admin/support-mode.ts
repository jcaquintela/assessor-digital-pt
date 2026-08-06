// Estado do "modo suporte" no navegador do admin.
// Guardado em localStorage porque a sessão do Supabase também é partilhada
// entre separadores — o aviso tem de aparecer em todos.

export const SUPPORT_MODE_KEY = "afonso.support-mode";

export type SupportModeState = {
  sessionId: string;
  targetUserId: string;
  targetName: string;
  adminAccessToken: string;
  adminRefreshToken: string;
  startedAt: string;
};

const EVENT = "afonso:support-mode";

export function readSupportMode(): SupportModeState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SUPPORT_MODE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SupportModeState;
    return parsed?.sessionId && parsed?.targetUserId ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSupportMode(state: SupportModeState) {
  window.localStorage.setItem(SUPPORT_MODE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(EVENT));
}

export function clearSupportMode() {
  window.localStorage.removeItem(SUPPORT_MODE_KEY);
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeSupportMode(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}