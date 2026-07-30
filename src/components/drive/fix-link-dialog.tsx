import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { listLinkTargets, setFileLink } from "@/lib/drive/drive.functions";

type EntityType = "person" | "property" | "opportunity";

const TYPE_LABEL: Record<EntityType, string> = {
  person: "Pessoa",
  property: "Imóvel",
  opportunity: "Negócio",
};

// Corrige a que registo um ficheiro existente está ligado. Nunca cria nem apaga ficheiros.
export function FixLinkDialog({
  fileId,
  fileName,
  replaceLinkId,
  open,
  onOpenChange,
}: {
  fileId: string | null;
  fileName?: string | null;
  replaceLinkId?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const fetchTargets = useServerFn(listLinkTargets);
  const save = useServerFn(setFileLink);
  const [type, setType] = useState<EntityType>("person");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const targets = useQuery({
    queryKey: ["drive", "link-targets"],
    queryFn: () => fetchTargets(),
    enabled: open,
  });

  useEffect(() => {
    if (open) { setSelected(null); setQ(""); }
  }, [open, fileId]);

  const list = (targets.data?.[type] ?? []).filter(
    (o: any) => !q.trim() || o.label.toLowerCase().includes(q.trim().toLowerCase()),
  );

  async function guardar() {
    if (!fileId || !selected) { toast.error("Escolhe um registo."); return; }
    setBusy(true);
    try {
      await save({ data: { fileId, entityType: type, entityId: selected, replaceLinkId: replaceLinkId ?? null } });
      await qc.invalidateQueries({ queryKey: ["drive"] });
      toast.success("Ligação corrigida.");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível corrigir a ligação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Corrigir ligação</DialogTitle>
          <DialogDescription>
            {fileName ? `${fileName} — escolhe` : "Escolhe"} a que registo este ficheiro pertence.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Tipo de registo</Label>
            <Select value={type} onValueChange={(v) => { setType(v as EntityType); setSelected(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABEL) as EntityType[]).map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Registo</Label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar…" className="mb-2" />
            <div className="max-h-56 space-y-1 overflow-auto rounded border p-1">
              {targets.isLoading && <div className="p-2 text-sm text-muted-foreground">A carregar…</div>}
              {!targets.isLoading && list.length === 0 && (
                <div className="p-2 text-sm text-muted-foreground">Sem registos deste tipo.</div>
              )}
              {list.map((o: any) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSelected(o.id)}
                  className={
                    "block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-muted " +
                    (selected === o.id ? "bg-muted font-medium" : "")
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={busy || !selected}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}