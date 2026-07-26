import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Archive, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { UploadedFilesList } from "@/components/uploaded-files-list";

export const Route = createFileRoute("/_authenticated/diversos")({
  head: () => ({
    meta: [
      { title: "Diversos — Assessor do Consultor" },
      { name: "description", content: "Notas, ideias e observações que o Assessor guardou por ti." },
      { property: "og:title", content: "Diversos — Assessor do Consultor" },
      { property: "og:description", content: "Notas, ideias e observações que o Assessor guardou por ti." },
    ],
  }),
  component: DiversosPage,
});

type MiscItem = {
  id: string;
  title: string;
  original_content: string | null;
  summary: string | null;
  source_channel: string;
  status: "inbox" | "reviewed" | "classified" | "archived" | "deleted";
  tags: string[] | null;
  created_at: string;
};

const STATUS_LABEL: Record<MiscItem["status"], string> = {
  inbox: "Por tratar",
  reviewed: "Revisto",
  classified: "Classificado",
  archived: "Arquivado",
  deleted: "Eliminado",
};

function DiversosPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<
    "recentes" | "tratar" | "classificados" | "arquivados" | "ficheiros"
  >("recentes");

  const items = useQuery({
    queryKey: ["misc"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("miscellaneous_items")
        .select("id, title, original_content, summary, source_channel, status, tags, created_at")
        .neq("status", "deleted")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as MiscItem[];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: MiscItem["status"] }) => {
      const { error } = await supabase.from("miscellaneous_items").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["misc"] }),
    onError: (e: any) => toast.error(e?.message ?? "Erro ao atualizar."),
  });

  const filtered = useMemo(() => {
    const rows = items.data ?? [];
    const byTab = rows.filter((r) => {
      if (tab === "tratar") return r.status === "inbox";
      if (tab === "classificados") return r.status === "classified" || r.status === "reviewed";
      if (tab === "arquivados") return r.status === "archived";
      return r.status !== "archived";
    });
    const needle = q.trim().toLowerCase();
    if (!needle) return byTab;
    return byTab.filter(
      (r) =>
        r.title.toLowerCase().includes(needle) ||
        (r.original_content ?? "").toLowerCase().includes(needle) ||
        (r.summary ?? "").toLowerCase().includes(needle),
    );
  }, [items.data, tab, q]);

  return (
    <AppShell>
      <PageHeader
        title="Diversos"
        subtitle="Notas, ideias e observações que o Assessor guardou por ti."
      />
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {(["recentes", "tratar", "classificados", "arquivados", "ficheiros"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-full border px-3 py-1 text-xs ${
                tab === k ? "bg-foreground text-background" : "bg-background text-foreground"
              }`}
            >
              {k === "recentes"
                ? "Recentes"
                : k === "tratar"
                ? "Por tratar"
                : k === "classificados"
                ? "Classificados"
                : k === "arquivados"
                ? "Arquivados"
                : "Ficheiros"}
            </button>
          ))}
          {tab !== "ficheiros" ? (
            <div className="ml-auto w-full max-w-xs">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar notas…" />
            </div>
          ) : null}
        </div>

        {tab === "ficheiros" ? (
          <UploadedFilesList />
        ) : items.isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar…</p>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Nada por aqui. Sempre que enviares uma nota ou observação ao Assessor sem enquadramento
              claro, aparece nesta área.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filtered.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{r.title}</p>
                    <Badge variant="outline" className="text-[10px]">
                      {STATUS_LABEL[r.status]}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      {r.source_channel}
                    </Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("pt-PT", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                  </div>
                  {r.original_content && r.original_content !== r.title ? (
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {r.original_content}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {r.status !== "reviewed" && r.status !== "classified" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setStatus.mutate({ id: r.id, status: "reviewed" })}
                      >
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Marcar como revisto
                      </Button>
                    ) : null}
                    {r.status !== "archived" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setStatus.mutate({ id: r.id, status: "archived" })}
                      >
                        <Archive className="mr-1 h-3.5 w-3.5" /> Arquivar
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setStatus.mutate({ id: r.id, status: "deleted" })}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Eliminar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}