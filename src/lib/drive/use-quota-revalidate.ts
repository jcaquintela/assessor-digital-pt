// Revalidação automática da quota mensal do Drive.
//
// O consultor pode fazer upgrade noutro separador (área de pagamentos) ou ir
// a /subscricao e voltar. Quando regressa, a quota tem de estar fresca — não
// pode continuar bloqueado com um plano que já mudou.

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/** Invalida a quota do Drive sempre que a app volta a ficar em foco/visível. */
export function useQuotaRevalidate() {
  const qc = useQueryClient();

  useEffect(() => {
    const revalidate = () => {
      void qc.invalidateQueries({ queryKey: ["drive", "quota"] });
      void qc.invalidateQueries({ queryKey: ["my-billing"] });
    };
    // Ao montar (regresso de /subscricao dentro da app).
    revalidate();
    const onVisibility = () => {
      if (document.visibilityState === "visible") revalidate();
    };
    window.addEventListener("focus", revalidate);
    window.addEventListener("pageshow", revalidate);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("pageshow", revalidate);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [qc]);
}
