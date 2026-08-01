import * as React from "react";

/**
 * Contador de overlays modais abertos (diálogos, alertas, sheets, drawers).
 *
 * Com modais empilhados, fechar o de cima não pode libertar o scroll lock:
 * só quando o último fechar é que o body volta ao normal. Cada conteúdo modal
 * regista-se enquanto está montado; o body mantém `data-scroll-locked` e
 * `data-overlay-count` até o contador chegar a zero.
 */
let count = 0;
const listeners = new Set<(n: number) => void>();

function sync() {
  if (typeof document === "undefined") return;
  const body = document.body;
  if (count > 0) {
    body.setAttribute("data-scroll-locked", "");
    body.setAttribute("data-overlay-count", String(count));
  } else {
    body.removeAttribute("data-overlay-count");
    body.removeAttribute("data-scroll-locked");
    body.style.removeProperty("pointer-events");
  }
  listeners.forEach((l) => l(count));
}

export function pushOverlay() {
  count += 1;
  sync();
}

export function popOverlay() {
  count = Math.max(0, count - 1);
  sync();
}

export function getOverlayCount() {
  return count;
}

export function subscribeOverlayCount(listener: (n: number) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Regista o overlay enquanto o componente estiver montado (i.e. aberto). */
export function useOverlayStack() {
  React.useEffect(() => {
    pushOverlay();
    return () => popOverlay();
  }, []);
}