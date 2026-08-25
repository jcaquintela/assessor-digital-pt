// Botão "Forçar sincronização" do painel Integrações da Agenda.
// Só aparece quando há pelo menos um calendário ligado. Faz a ronda completa
// deste consultor (delta + verificação evento-a-evento), com travão de 60s
// para não estourar a quota do provedor a pedido de cliques repetidos.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getCalendarStatus, syncCalendarNow } from "@/lib/calendar/calendar.functions";

const COOLDOWN_MS = 60_000;

export function ForceSyncButton() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [lastAt, setLastAt] = useState<number | null>(null);

  const status = useQuery({
    queryKey: ["calendar-status"],
    queryFn: () => getCalendarStatus(),
    staleTime: 60_000,
  });

  const ligados = (status.data ?? []).filter((r) => r.connected);
  if (status.isLoading || ligados.length === 0) return null;

  const sincronizar = async () => {
    if (lastAt && Date.now() - lastAt < COOLDOWN_MS) {
      const faltam = Math.ceil((COOLDOWN_MS - (Date.now() - lastAt)) / 1000);
      toast.info(`Acabei de sincronizar. Tenta outra vez dentro de ${faltam}s.`);
      return;
    }
    setBusy(true);
    try {
      const r = await syncCalendarNow();
      setLastAt(Date.now());
      const applied = r.reduce((n, x) => n + x.applied, 0);
      const erro = r.find((x) => x.error);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["follow_ups"] }),
        qc.invalidateQueries({ queryKey: ["calendar-status"] }),
      ]);
      if (erro) {
        toast.error("O calendário recusou a ligação. Volta a autorizar nas Definições.");
      } else {
        toast.success(
          applied > 0
            ? `${applied} alteração(ões) trazida(s) do calendário.`
            : "Já estava tudo em dia.",
        );
      }
    } catch {
      toast.error("Não consegui sincronizar agora. Tenta dentro de um minuto.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="secondary"
      className="w-full justify-start"
      onClick={sincronizar}
      disabled={busy}
    >
      <RefreshCw className={`mr-2 h-4 w-4${busy ? " animate-spin" : ""}`} />
      {busy ? "A sincronizar…" : "Forçar sincronização"}
    </Button>
  );
}
