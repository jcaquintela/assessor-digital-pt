// Vista de seguimentos arquivados — único sítio onde a eliminação permanente
// existe. Um registo ativo nunca mostra este botão: arquiva-se primeiro.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatDataHora } from "@/lib/demo-data";
import { PermanentDeleteDialog } from "@/components/records/permanent-delete-dialog";
import { permanentlyDeleteRecordFn } from "@/lib/records/permanent-delete.functions";

interface Row {
  id: string;
  title: string | null;
  due_date: string | null;
  type: string | null;
  status: string | null;
}

export function ArchivedFollowUps() {
  const qc = useQueryClient();
  const [alvo, setAlvo] = useState<Row | null>(null);

  const lista = useQuery({
    queryKey: ["follow-ups", "arquivados"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("follow_ups")
        .select("id, title, due_date, type, status")
        .not("archived_at", "is", null)
        .order("due_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const eliminar = useMutation({
    mutationFn: async (vars: { id: string; reason: string }) =>
      permanentlyDeleteRecordFn({ data: { type: "follow_up", id: vars.id, reason: vars.reason } }),
    onSuccess: () => {
      toast.success("Seguimento eliminado para sempre.");
      setAlvo(null);
      qc.invalidateQueries({ queryKey: ["follow-ups"] });
      void lista.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível eliminar."),
  });

  if (lista.isLoading) return <p className="c-seg-line">A carregar…</p>;
  const rows = lista.data ?? [];
  if (!rows.length) return <p className="c-seg-line">Nada arquivado.</p>;

  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.id} className="c-seg feito p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="c-seg-title truncate">{r.title ?? "Seguimento"}</p>
              <p className="c-seg-meta mt-1">{r.due_date ? formatDataHora(r.due_date) : "Sem data"}</p>
            </div>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setAlvo(r)}>
              Eliminar para sempre
            </Button>
          </div>
        </div>
      ))}
      <PermanentDeleteDialog
        open={!!alvo}
        onOpenChange={(v) => (!v ? setAlvo(null) : null)}
        alvo={alvo?.title ?? "este seguimento"}
        detalhes={[
          "O evento é cancelado no calendário ligado, se existir.",
          "Os lembretes associados desaparecem.",
        ]}
        aExecutar={eliminar.isPending}
        onConfirm={(reason) => alvo && eliminar.mutate({ id: alvo.id, reason })}
      />
    </div>
  );
}
