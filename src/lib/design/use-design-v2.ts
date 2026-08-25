import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { getMyDesignV2 } from "./design-v2.functions";
import { useHasSession } from "@/hooks/use-has-session";

export const DESIGN_V2_QUERY_KEY = ["design", "v2"] as const;

/**
 * Redesenho v2 atrás de flag.
 *
 * Aplica a classe `design-v2` no <html> — assim os tokens novos chegam também
 * aos portais do Radix (Dialog, Sheet, Popover), que vivem fora de
 * `.consult-root`. Sem isto, os componentes shadcn ficariam na paleta antiga.
 */
export function useDesignV2(): boolean {
  const fetchFlag = useServerFn(getMyDesignV2);
  const hasSession = useHasSession();
  const { data } = useQuery({
    queryKey: DESIGN_V2_QUERY_KEY,
    queryFn: () => fetchFlag(),
    enabled: hasSession === true,
    retry: false,
    staleTime: 5 * 60_000,
  });
  const enabled = !!data?.enabled;

  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    html.classList.toggle("design-v2", enabled);
    return () => {
      html.classList.remove("design-v2");
    };
  }, [enabled]);

  return enabled;
}
