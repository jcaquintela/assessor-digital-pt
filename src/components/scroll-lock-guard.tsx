import { useEffect } from "react";
import { getOverlayCount } from "@/lib/ui/overlay-stack";

/**
 * Rede de segurança para o scroll lock dos overlays (Radix/Vaul).
 *
 * Radix bloqueia o scroll do body enquanto um diálogo/sheet/drawer modal está
 * aberto. Em casos de desmontagem abrupta (navegação, HMR, dois overlays a
 * fechar ao mesmo tempo) os atributos ficam pendurados no body e a página deixa
 * de fazer scroll ou fica sem pointer-events. Este guarda observa o body e,
 * quando não existe nenhum overlay aberto no DOM, repõe o estado normal.
 */
export function ScrollLockGuard() {
  useEffect(() => {
    const body = document.body;

    const hasOpenOverlay = () =>
      getOverlayCount() > 0 ||
      document.querySelector(
        '[data-radix-popper-content-wrapper], [data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [data-vaul-drawer][data-state="open"]',
      ) !== null;

    const cleanup = () => {
      if (hasOpenOverlay()) return;
      if (body.hasAttribute("data-scroll-locked")) body.removeAttribute("data-scroll-locked");
      if (body.style.pointerEvents === "none") body.style.removeProperty("pointer-events");
      if (body.style.overflow === "hidden") body.style.removeProperty("overflow");
      if (body.style.paddingRight) body.style.removeProperty("padding-right");
    };

    const observer = new MutationObserver(() => {
      // Espera o fim da animação de saída do overlay antes de limpar.
      window.setTimeout(cleanup, 350);
    });
    observer.observe(body, {
      attributes: true,
      attributeFilter: ["data-scroll-locked", "data-overlay-count", "style"],
    });
    observer.observe(document.getElementById("root") ?? body, { childList: true, subtree: false });

    return () => observer.disconnect();
  }, []);

  return null;
}