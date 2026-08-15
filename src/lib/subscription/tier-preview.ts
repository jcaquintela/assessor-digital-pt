import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAdminRole } from "@/lib/admin.functions";
import { normalizeTier, type SubscriptionTier } from "./tiers";

// Simulação de plano ("ver como") para super admin.
// Vive APENAS em sessionStorage do separador: nunca toca em
// profiles.subscription_tier / billing_* e desaparece ao fechar a sessão.
// É usada só para LEITURA de gating de UI — nenhuma escrita passa por aqui.
const KEY = "afonso.previewTier";
const EVT = "afonso:preview-tier";

export function readPreviewTier(): SubscriptionTier | null {
  if (typeof window === "undefined") return null;
  const v = window.sessionStorage.getItem(KEY);
  return v ? normalizeTier(v) : null;
}

export function setPreviewTier(tier: SubscriptionTier | null) {
  if (typeof window === "undefined") return;
  if (tier) window.sessionStorage.setItem(KEY, tier);
  else window.sessionStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVT));
}

// true só quando o utilizador autenticado é super admin.
export function useIsSuperAdmin() {
  const fetchRole = useServerFn(getMyAdminRole);
  const { data } = useQuery({
    queryKey: ["admin", "my-role"],
    queryFn: () => fetchRole(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return data?.role === "super_admin";
}

// Tier simulado activo (null se não houver, ou se não for super admin).
export function usePreviewTier(): SubscriptionTier | null {
  const isSuper = useIsSuperAdmin();
  const [tier, setTier] = useState<SubscriptionTier | null>(null);

  useEffect(() => {
    const sync = () => setTier(readPreviewTier());
    sync();
    window.addEventListener(EVT, sync);
    return () => window.removeEventListener(EVT, sync);
  }, []);

  return isSuper ? tier : null;
}
