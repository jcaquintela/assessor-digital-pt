import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listProductFeedback, updateProductFeedback } from "@/lib/admin/feedback.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/feedback")({
  component: FeedbackPage,
  head: () => ({
    meta: [
      { title: "Feedback dos consultores · Admin" },
      { name: "description", content: "Erros e sugestões enviados pelos consultores pelo WhatsApp ou Telegram." },
    ],
  }),
});

const STATUS_LABEL: Record<string, string> = {
  novo: "Novo",
  em_analise: "Em análise",
  resolvido: "Resolvido",
  arquivado: "Arquivado",
};

function FeedbackPage() {
  const list = useServerFn(listProductFeedback);
  const update = useServerFn(updateProductFeedback);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "feedback"], queryFn: () => list() });

  const [kind, setKind] = useState<string>("todos");
  const [status, setStatus] = useState<string>("todos");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const mut = useMutation({
    mutationFn: (v: { id: string; status?: string; internalNote?: string }) => update({ data: v as never }),
    onSuccess: () => {
      toast.success("Atualizado");
      qc.invalidateQueries({ queryKey: ["admin", "feedback"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falhou"),
  });

  const items = useMemo(() => {
    return ((data as any)?.items ?? []).filter(
      (i: any) => (kind === "todos" || i.kind === kind) && (status === "todos" || i.status === status),
    );
  }, [data, kind, status]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Feedback dos consultores</h1>
        <p className="text-sm text-muted-foreground">
          Erros e sugestões que os consultores enviaram pelo WhatsApp, Telegram ou dashboard, sempre depois de
          confirmarem que queriam registar.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {[
          { v: "todos", l: "Todos" },
          { v: "bug", l: "Erros" },
          { v: "suggestion", l: "Sugestões" },
        ].map((o) => (
          <Button key={o.v} size="sm" variant={kind === o.v ? "default" : "outline"} onClick={() => setKind(o.v)}>
            {o.l}
          </Button>
        ))}
        <span className="mx-2 w-px bg-border" />
        {["todos", "novo", "em_analise", "resolvido", "arquivado"].map((s) => (
          <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
            {s === "todos" ? "Todos os estados" : STATUS_LABEL[s]}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="rounded-lg border p-6 text-sm text-muted-foreground">A carregar…</div>
      ) : !items.length ? (
        <div className="rounded-lg border p-6 text-sm text-muted-foreground">Ainda não há feedback registado.</div>
      ) : (
        <div className="space-y-3">
          {items.map((i: any) => (
            <article key={i.id} className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border px-2 py-0.5 font-medium text-foreground">
                  {i.kind === "bug" ? "Erro" : "Sugestão"}
                </span>
                <span className="rounded-full border px-2 py-0.5">{STATUS_LABEL[i.status] ?? i.status}</span>
                <span>{i.consultant_name ?? i.consultant_email ?? "Consultor"}</span>
                <span>· {i.channel}</span>
                <span>· {new Date(i.created_at).toLocaleString("pt-PT")}</span>
              </div>

              <p className="whitespace-pre-wrap text-sm">{i.body}</p>

              <Textarea
                rows={2}
                placeholder="Nota interna"
                defaultValue={i.internal_note ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [i.id]: e.target.value }))}
              />

              <div className="flex flex-wrap gap-2">
                {["em_analise", "resolvido", "arquivado"].map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant="outline"
                    disabled={mut.isPending || i.status === s}
                    onClick={() => mut.mutate({ id: i.id, status: s, internalNote: notes[i.id] ?? i.internal_note ?? "" })}
                  >
                    {STATUS_LABEL[s]}
                  </Button>
                ))}
                <Button
                  size="sm"
                  disabled={mut.isPending || notes[i.id] === undefined}
                  onClick={() => mut.mutate({ id: i.id, internalNote: notes[i.id] ?? "" })}
                >
                  Guardar nota
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
