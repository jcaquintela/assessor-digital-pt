import { useEffect, useState } from "react";

/**
 * Relógio partilhado dos widgets: reavalia de X em X minutos e sempre que a
 * página volta a ficar visível/em foco. Assim um compromisso que termina
 * desaparece do dashboard sem o consultor ter de recarregar.
 */
export function useNow(intervalMs = 5 * 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, intervalMs);
    const onFocus = () => tick();
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);

  return now;
}