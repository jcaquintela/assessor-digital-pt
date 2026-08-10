import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Botão flutuante de mobile. Vai para o body por portal: assim nenhum
 * antecessor com transform/filter/backdrop-blur cria um bloco de contenção
 * que "prende" o position:fixed a meio do scroll (bug conhecido em iOS).
 * A posição (acima da tab bar + safe area) vive na classe .mobile-fab.
 */
export function MobileFab({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<div className="mobile-fab">{children}</div>, document.body);
}
