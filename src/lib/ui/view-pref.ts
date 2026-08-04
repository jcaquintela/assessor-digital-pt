import { useEffect, useRef } from "react";

export type SavedView = "lista" | "grelha";

// Preferência partilhada entre Pessoas e Imóveis: o consultor escolhe uma vez
// e a vista mantém-se ao navegar entre páginas e entre sessões.
const KEY = "afonso.view";

function read(): SavedView | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "grelha" || v === "lista" ? v : null;
  } catch {
    return null;
  }
}

function write(v: SavedView) {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* modo privado: ignora */
  }
}

/**
 * Sincroniza a vista (que vive no URL) com a preferência guardada.
 * - Sem `view` no URL: aplica a preferência guardada.
 * - Com `view` no URL: passa a ser a nova preferência.
 */
export function usePersistedView(
  view: SavedView,
  setView: (v: SavedView) => void,
  hasSearchView: boolean,
) {
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    if (hasSearchView) return;
    const saved = read();
    if (saved && saved !== view) setView(saved);
  }, [hasSearchView, view, setView]);

  useEffect(() => {
    if (!applied.current) return;
    write(view);
  }, [view]);
}
