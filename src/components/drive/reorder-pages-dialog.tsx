import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp } from "lucide-react";
import { listDocumentPages, reorderDocumentPages } from "@/lib/drive/doc-pages.functions";

export function ReorderPagesDialog(props: {
  fileId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { fileId, open, onOpenChange } = props;
  const qc = useQueryClient();
  const list = useServerFn(listDocumentPages);
  const reorder = useServerFn(reorderDocumentPages);
  const [order, setOrder] = useState<string[]>([]);

  const pages = useQuery({
    queryKey: ["doc-pages", fileId],
    queryFn: () => list({ data: { fileId: fileId as string } }),
    enabled: open && !!fileId,
  });

  const rows = (pages.data?.pages ?? []) as any[];
  useEffect(() => {
    setOrder(rows.map((r) => r.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.data]);

  const byId = new Map(rows.map((r) => [r.id, r]));

  function move(index: number, delta: number) {
    setOrder((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const save = useMutation({
    mutationFn: async () => reorder({ data: { fileId: fileId as string, orderedIds: order } }),
    onSuccess: () => {
      toast.success("Páginas ordenadas — leitura consolidada de novo.");
      qc.invalidateQueries({ queryKey: ["drive-files"] });
      qc.invalidateQueries({ queryKey: ["doc-pages", fileId] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Não consegui guardar a ordem."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ordenar páginas</DialogTitle>
          <DialogDescription>
            As fotos podem ter chegado fora de ordem. Arruma as páginas e volto a consolidar a
            leitura pela ordem certa.
          </DialogDescription>
        </DialogHeader>

        {pages.isLoading ? (
          <p className="c-muted text-[13px]">A carregar páginas…</p>
        ) : order.length === 0 ? (
          <p className="c-muted text-[13px]">Este ficheiro ainda não tem outras páginas.</p>
        ) : (
          <ol className="space-y-2">
            {order.map((id, i) => {
              const r = byId.get(id);
              return (
                <li key={id} className="c-card flex items-center gap-2 p-2.5">
                  <span className="c-mono w-6 shrink-0 text-[12px]">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">
                      {r?.original_file_name ?? "Página"}
                    </div>
                    <div className="c-muted truncate text-[11.5px]">
                      {r?.document_type ?? "Documento"}
                      {r?.doc_morada ? ` · ${r.doc_morada}` : ""}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Subir página ${i + 1}`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Descer página ${i + 1}`}
                    disabled={i === order.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ol>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={order.length < 2 || save.isPending}
          >
            {save.isPending ? "A guardar…" : "Guardar ordem"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
