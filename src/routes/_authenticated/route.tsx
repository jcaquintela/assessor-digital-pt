import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppStoreProvider } from "@/lib/store";
import { getMyPortalMode } from "@/lib/v2/portal.functions";
import { portalRedirectFor, type PortalMode } from "@/lib/v2/portal-scope";

// Modo do portal (V1 de hoje ou portal mínimo V2), guardado 60 s por conta.
// Qualquer falha = V1, para nunca mudar a experiência de quem está na V1.
const modeCache = new Map<string, { mode: PortalMode; at: number }>();
async function portalModeFor(userId: string): Promise<PortalMode> {
  const hit = modeCache.get(userId);
  if (hit && Date.now() - hit.at < 60_000) return hit.mode;
  try {
    const { mode } = await getMyPortalMode();
    modeCache.set(userId, { mode, at: Date.now() });
    return mode;
  } catch {
    return "v1";
  }
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const target = portalRedirectFor(location.pathname, await portalModeFor(data.user.id));
    if (target) throw redirect({ to: target, replace: true });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <AppStoreProvider>
      <Outlet />
    </AppStoreProvider>
  );
}
