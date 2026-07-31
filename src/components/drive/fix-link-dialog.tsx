import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { X, Plus } from "lucide-react";
import {
  listLinkTargets,
  setFileLink,
  getDriveFile,
  removeFileLink,
  suggestFileLinks,
} from "@/lib/drive/drive.functions";

type EntityType = "person" | "property" | "opportunity";

const TYPE_LABEL: Record<EntityType, string> = {
  person: "Pessoa",
  property: "Imóvel",
  opportunity: "Negócio",
};

// Gere as ligações de um ficheiro. Um ficheiro pode estar ligado a 0, 1 ou
// várias fichas ao mesmo tempo (Pessoa, Imóvel, Negócio) — adicionar nunca
// remove o que já lá está. Nunca cria nem apaga ficheiros.
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
  const fetchFile = useServerFn(getDriveFile);
  const dropLink = useServerFn(removeFileLink);
  const fetchSuggestions = useServerFn(suggestFileLinks);
  const [type, setType] = useState<EntityType>("person");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const targets = useQuery({
    queryKey: ["drive", "link-targets"],
    queryFn: () => fetchTargets(),
    enabled: open,
  });

  const current = useQuery({
    queryKey: ["drive", "one", fileId],
    queryFn: () => fetchFile({ data: { id: fileId! } }),
    enabled: open && !!fileId,
  });

  const suggestions = useQuery({
    queryKey: ["drive", "suggestions", fileId],
    queryFn: () => fetchSuggestions({ data: { fileId: fileId! } }),
    enabled: open && !!fileId,
  });

  useEffect(() => {
    if (open) { setSelected(null); setQ(""); }
  }, [open, fileId]);

  const list = (targets.data?.[type] ?? []).filter(
    (o: any) => !q.trim() || o.label.toLowerCase().includes(q.trim().toLowerCase()),
  );

  async function invalidar() {
    await qc.invalidateQueries({ queryKey: ["drive"] });
    await qc.invalidateQueries({ queryKey: ["entity-files"] });
  }

  async function adicionar(entityType: EntityType, entityId: string) {
    if (!fileId) return;
    setBusy(true);
    try {
      await save({ data: { fileId, entityType, entityId, replaceLinkId: replaceLinkId ?? null } });
      await invalidar();
      setSelected(null);
      toast.success("Ligação adicionada.");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível adicionar a ligação.");
    } finally {
      setBusy(false);
    }
  }

  async function remover(linkId: string) {
    setBusy(true);
    try {
      await dropLink({ data: { linkId } });
      await invalidar();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível remover a ligação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ligações do ficheiro</DialogTitle>
          <DialogDescription>
            {fileName ? `${fileName} — ` : ""}um ficheiro pode estar ligado a várias fichas
            (pessoa, imóvel e negócio) ao mesmo tempo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Ligações atuais</Label>
            {(current.data?.links?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Ainda sem ligações.</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {(current.data?.links ?? []).map((l: any) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-sm">
                    <span className="min-w-0 truncate">
                      {l.entity_name ?? l.entity_type}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {TYPE_LABEL[l.entity_type as EntityType] ?? l.entity_type}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label="Remover ligação"
                      className="rounded p-1 text-muted-foreground hover:bg-muted"
                      disabled={busy}
                      onClick={() => remover(l.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {(suggestions.data?.length ?? 0) > 0 && (
            <div>
              <Label>Sugestões do Afonso</Label>
              <div className="mt-1 space-y-1">
                {(suggestions.data ?? []).map((s: any) => (
                  <button
                    key={`${s.entityType}:${s.entityId}`}
                    type="button"
                    disabled={busy}
                    onClick={() => adicionar(s.entityType, s.entityId)}
                    className="flex w-full items-center gap-2 rounded border border-dashed px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 truncate">
                      {s.label}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {TYPE_LABEL[s.entityType as EntityType]} · {s.reason}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

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
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button
            onClick={() => selected && adicionar(type, selected)}
            disabled={busy || !selected}
          >
            Adicionar ligação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}