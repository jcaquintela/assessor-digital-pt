import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  findMergeCandidates,
  previewMerge,
  applyMerge,
  type MergeAccount,
  type MergePreview,
} from "@/lib/admin/merge.functions";
import { Badge, Empty } from "@/components/admin/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type MergeSource = { id: string; label: string; suggestedTargetId?: string | null };

export function acctLabel(a: MergeAccount) {
  return `${a.name || "sem nome"} · ${a.email || "sem email"}${a.phone ? ` · ${a.phone}` : ""}`;
}

const REASON_SUGGESTIONS = [
  "Mesma pessoa: conta do WhatsApp e conta do painel.",
  "Duplicado criado no registo — fica a conta de email.",
  "Pedido do consultor para juntar os acessos.",
];

export function AccountMergeDialog({
  source,
  onClose,
  onDone,
}: {
  source: MergeSource | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const candidatesFn = useServerFn(findMergeCandidates);
  const previewFn = useServerFn(previewMerge);
  const applyFn = useServerFn(applyMerge);

  const [query, setQuery] = useState("");
  const [targetId, setTargetId] = useState<string | null>(source?.suggestedTargetId ?? null);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<MergePreview | null>(null);

  const reset = () => {
    setQuery("");
    setTargetId(null);
    setReason("");
    setPreview(null);
  };

  const { data, isFetching } = useQuery({
    queryKey: ["admin", "merge-candidates", source?.id, query],
    enabled: !!source,
    queryFn: () => candidatesFn({ data: { source_user_id: source!.id, query: query || undefined } }),
  });

  const doPreview = useMutation({
    mutationFn: () => previewFn({ data: { source_user_id: source!.id, target_user_id: targetId! } }),
    onSuccess: (p) => setPreview(p),
    onError: (e: Error) => toast.error(e.message),
  });

  // Pré-visualização automática assim que houver conta escolhida — deixa de ser um clique obrigatório.
  useEffect(() => {
    if (!source || !targetId || preview || doPreview.isPending) return;
    doPreview.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.id, targetId, preview]);

  const doApply = useMutation({
    mutationFn: () =>
      applyFn({ data: { source_user_id: source!.id, target_user_id: targetId!, reason: reason.trim() } }),
    onSuccess: () => {
      const alvo = preview ? acctLabel(preview.target) : "a conta escolhida";
      toast.success(`Contas fundidas. Fica ${alvo}.`);
      onDone();
      reset();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível fundir as contas."),
  });

  const missing: string[] = [];
  if (!targetId) missing.push("escolhe a conta que fica");
  else if (!preview) missing.push(doPreview.isPending ? "a calcular a pré-visualização" : "clica em Pré-visualizar");
  if (reason.trim().length < 3) missing.push("escreve o motivo da fusão");

  return (
    <Dialog
      open={!!source}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="admin-surface max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fundir contas</DialogTitle>
          <DialogDescription>
            Tudo o que existe em <strong>{source?.label}</strong> passa para a conta que escolheres — plano, estado
            de beta, canais e todos os registos. A conta de origem fica desligada; nada é apagado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {data?.source && (
            <div className="rounded-md border p-3">
              <div className="mini">Conta de origem (vai ser desligada)</div>
              <div>{acctLabel(data.source)}</div>
              <div className="mini">
                Canais: {data.source.channels.join(", ") || "—"} · Plano: {data.source.tier}
              </div>
            </div>
          )}

          <label className="block">
            1 · Procurar a conta que fica (nome, email ou telemóvel)
            <input
              className="admin-input mt-1 w-full"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPreview(null);
              }}
              placeholder="nome@empresa.pt"
            />
          </label>

          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {isFetching && <p className="mini">A procurar…</p>}
            {!isFetching && (data?.candidates ?? []).length === 0 && (
              <Empty>Nenhuma conta encontrada. Escreve o email ou o nome para procurar.</Empty>
            )}
            {(data?.candidates ?? []).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setTargetId(c.id);
                  setPreview(null);
                }}
                className={`w-full rounded-md border p-3 text-left ${targetId === c.id ? "border-foreground" : ""}`}
              >
                <div>{acctLabel(c)}</div>
                <div className="mini">
                  {c.is_shadow ? <Badge tone="warn">criada pelo canal</Badge> : <Badge tone="ok">conta de email</Badge>}{" "}
                  · Plano: {c.tier} · Canais: {c.channels.join(", ") || "—"}
                </div>
              </button>
            ))}
          </div>

          {preview && (
            <div className="rounded-md border p-3">
              <div className="mini">
                Vão passar {preview.total} registo(s) para {acctLabel(preview.target)}
              </div>
              <ul className="mini mt-1 grid grid-cols-2 gap-x-4">
                {preview.tables.map((t) => (
                  <li key={t.table}>
                    {t.table}: {t.rows}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <label className="block">
            2 · Motivo da fusão (fica na auditoria)
            <input
              className="admin-input mt-1 w-full"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Mesma pessoa: conta do WhatsApp e conta do painel."
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {REASON_SUGGESTIONS.map((r) => (
              <button key={r} type="button" className="admin-pill" onClick={() => setReason(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>

        {missing.length > 0 && (
          <p className="mini text-right" style={{ color: "var(--muted)" }}>
            Para fundir: {missing.join(" · ")}.
          </p>
        )}

        <DialogFooter>
          <button type="button" className="admin-btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="admin-btn"
            disabled={!targetId || doPreview.isPending}
            onClick={() => doPreview.mutate()}
          >
            {doPreview.isPending ? "A calcular…" : preview ? "Recalcular" : "Pré-visualizar"}
          </button>
          <button
            type="button"
            className="admin-btn-primary"
            disabled={!preview || reason.trim().length < 3 || doApply.isPending}
            onClick={() => doApply.mutate()}
          >
            {doApply.isPending ? "A fundir…" : "Fundir contas"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
