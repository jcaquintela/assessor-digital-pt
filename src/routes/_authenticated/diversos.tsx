import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Archive, Trash2, CheckCircle2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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

const CANAL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  web: "Dashboard",
};

function DiversosPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<
    "recentes" | "tratar" | "classificados" | "arquivados" | "ficheiros"
  >("recentes");
  const [selected, setSelected] = useState<string[]>([]);

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
      const { data, error } = await supabase
        .from("miscellaneous_items")
        .update({ status })
        .eq("id", id)
        .select("id, status");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Não foi possível atualizar esta nota (sem permissão ou já removida).");
      }
      return data[0];
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["misc"] });
      toast.success(
        vars.status === "archived"
          ? "Nota arquivada."
          : vars.status === "reviewed"
          ? "Nota marcada como revista."
          : "Nota eliminada.",
      );
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao atualizar."),
  });

  // Arquivar em lote reutiliza a mesma escrita da ação individual.
  const archiveMany = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await supabase
        .from("miscellaneous_items")
        .update({ status: "archived" })
        .in("id", ids)
        .select("id");
      if (error) throw error;
      return data ?? [];
    },
    onSuccess: (rows) => {
      qc.invalidateQueries({ queryKey: ["misc"] });
      setSelected([]);
      toast.success(rows.length === 1 ? "1 nota arquivada." : `${rows.length} notas arquivadas.`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao arquivar."),
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

  const selectable = filtered.filter((r) => r.status !== "archived");
  const selectedVisible = selected.filter((id) => selectable.some((r) => r.id === id));
  const allSelected = selectable.length > 0 && selectedVisible.length === selectable.length;
  const toggleOne = (id: string, on: boolean) =>
    setSelected((prev) => (on ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));

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
              className={"c-pill" + (tab === k ? " active" : "")}
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
          <p className="c-muted text-sm">A carregar…</p>
        ) : filtered.length === 0 ? (
          <div className="c-empty">
            Nada por tratar neste momento.
            <br />
            <span className="text-[12.5px]">
              sempre que o teu assessor não perceber algo, fica aqui — nunca desaparece
            </span>
          </div>
        ) : (
          <div className="grid gap-2">
            {selectable.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 px-1">
                <label className="c-muted flex cursor-pointer items-center gap-2 text-[12.5px]">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(v) =>
                      setSelected(v === true ? selectable.map((r) => r.id) : [])
                    }
                    aria-label="Selecionar todas as notas visíveis"
                  />
                  Selecionar tudo
                </label>
                {selectedVisible.length > 0 ? (
                  <>
                    <span className="c-muted text-[12.5px]">
                      {selectedVisible.length} selecionada{selectedVisible.length === 1 ? "" : "s"}
                    </span>
                    <button
                      type="button"
                      className="c-badge"
                      disabled={archiveMany.isPending}
                      onClick={() => archiveMany.mutate(selectedVisible)}
                    >
                      <Archive className="h-3 w-3" /> Arquivar selecionados
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
            {filtered.map((r) => (
              <div key={r.id} className="c-card c-card-hover p-3.5">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.status !== "archived" ? (
                      <Checkbox
                        checked={selected.includes(r.id)}
                        onCheckedChange={(v) => toggleOne(r.id, v === true)}
                        aria-label={`Selecionar nota ${r.title}`}
                      />
                    ) : null}
                    <Link
                      to="/diversos/$id"
                      params={{ id: r.id }}
                      className="text-[14px] font-semibold underline-offset-2 outline-none hover:underline focus-visible:underline"
                      aria-label={`Abrir nota ${r.title}`}
                    >
                      {r.title}
                    </Link>
                    <span className={"c-badge" + (r.status === "inbox" ? " warn" : r.status === "archived" ? "" : " ok")}>
                      {STATUS_LABEL[r.status]}
                    </span>
                    <span className="c-badge">
                      via {CANAL_LABEL[r.source_channel] ?? r.source_channel}
                    </span>
                    <span className="c-muted c-mono ml-auto text-[11px]">
                      {new Date(r.created_at).toLocaleDateString("pt-PT", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                  </div>
                  {r.original_content && r.original_content !== r.title ? (
                    <p className="c-soft whitespace-pre-wrap text-[13px] leading-relaxed">
                      {r.original_content}
                    </p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {r.status !== "reviewed" && r.status !== "classified" ? (
                      <button
                        type="button"
                        className="c-badge"
                        disabled={setStatus.isPending}
                        onClick={() => setStatus.mutate({ id: r.id, status: "reviewed" })}
                      >
                        <CheckCircle2 className="h-3 w-3" /> Marcar como revisto
                      </button>
                    ) : null}
                    {r.status !== "archived" ? (
                      <button
                        type="button"
                        className="c-badge"
                        disabled={setStatus.isPending}
                        onClick={() => setStatus.mutate({ id: r.id, status: "archived" })}
                      >
                        <Archive className="h-3 w-3" /> Arquivar
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="c-badge text-destructive"
                      disabled={setStatus.isPending}
                      onClick={() => setStatus.mutate({ id: r.id, status: "deleted" })}
                    >
                      <Trash2 className="h-3 w-3" /> Eliminar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}