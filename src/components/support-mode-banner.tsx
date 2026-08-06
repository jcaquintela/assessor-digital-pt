import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  clearSupportMode,
  readSupportMode,
  subscribeSupportMode,
  type SupportModeState,
} from "@/lib/admin/support-mode";
import { endSupportSession } from "@/lib/admin/support-mode.functions";

export function SupportModeBanner() {
  const [state, setState] = useState<SupportModeState | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const sync = () => setState(readSupportMode());
    sync();
    return subscribeSupportMode(sync);
  }, []);

  if (!state) return null;

  const sair = async () => {
    setLeaving(true);
    try {
      // Repor a sessão do admin antes de fechar a sessão de suporte,
      // para o registo ficar em nome do admin.
      const { error } = await supabase.auth.setSession({
        access_token: state.adminAccessToken,
        refresh_token: state.adminRefreshToken,
      });
      if (error) throw error;
      await endSupportSession({ data: { session_id: state.sessionId } }).catch(() => null);
      clearSupportMode();
      window.location.assign("/admin/utilizadores");
    } catch {
      setLeaving(false);
      toast.error("Não foi possível voltar à tua conta. Volta a entrar no admin.");
    }
  };

  return (
    <div
      role="status"
      className="sticky top-0 z-[100] flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/40 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950"
    >
      <span>
        Modo suporte — estás a ver a app como <strong>{state.targetName}</strong>. Tudo o que fizeres
        fica registado como “admin agiu em nome de {state.targetName}”.
      </span>
      <button
        type="button"
        onClick={sair}
        disabled={leaving}
        className="rounded-md border border-amber-950/30 bg-amber-950 px-3 py-1 text-xs font-semibold text-amber-50 disabled:opacity-60"
      >
        {leaving ? "A sair…" : "Sair do modo suporte"}
      </button>
    </div>
  );
}