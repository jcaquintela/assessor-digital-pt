import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { getMyEffectiveTier } from "./tier.functions";
import { usePreviewTier } from "./tier-preview";

export const EFFECTIVE_TIER_QUERY_KEY = ["subscription", "effectiveTier"] as const;

// O tier NÃO vive no JWT: `getMyEffectiveTier` chama sempre `effective_tier()`
// na BD. O único cache é o do React Query — por isso mantemo-lo curto e
// revalidamo-lo em foco/reconexão/intervalo, para que um upgrade feito no
// servidor apareça sozinho, sem o cliente ter de sair e voltar a entrar.
export function useEffectiveTier() {
  const fetchTier = useServerFn(getMyEffectiveTier);
  const qc = useQueryClient();
  // Simulação "ver como" (só super admin, só nesta sessão de navegação).
  const previewTier = usePreviewTier();

  const query = useQuery({
    queryKey: EFFECTIVE_TIER_QUERY_KEY,
    queryFn: () => fetchTier(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: true,
  });

  // Regresso à app (separador escondido → visível) revalida de imediato.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        qc.invalidateQueries({ queryKey: EFFECTIVE_TIER_QUERY_KEY });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [qc]);

  if (previewTier) {
    return { ...query, data: { tier: previewTier }, isPending: false } as typeof query;
  }
  return query;
}
