import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { humanizeMiscText, humanizeMiscTitle, sanitizeMiscFields } from "@/lib/assessor/misc-text";
import { miscReason } from "@/lib/assessor/misc-reason";
import { MiscActions } from "@/components/diversos/misc-actions";
import { MiscLinkedBadges } from "@/components/diversos/linked-badge";
import { ChevronLeft, Save, Trash2, Archive, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type Status = "inbox" | "reviewed" | "classified" | "archived" | "deleted";

type MiscItem = {
  id: string;
  title: string;
  original_content: string | null;
  category?: string | null;
  related_person_id?: string | null;
  related_property_id?: string | null;
  summary: string | null;
  source_channel: string;
  status: Status;
  tags: string[] | null;
  created_at: string;
};

const STATUS_LABEL: Record<Status, string> = {
  inbox: "Por tratar",
  reviewed: "Revisto",
  classified: "Classificado",
  archived: "Arquivado",
  deleted: "Eliminado",
};
const STATUS_OPTS: Status[] = ["inbox", "reviewed", "classified", "archived"];

export const Route = createFileRoute("/_authenticated/diversos/$id")({
  head: () => ({
    meta: [
      { title: "Ficha de nota — Afonso" },
      { name: "description", content: "Nota, ideia ou observação guardada pelo Assessor." },
      { property: "og:title", content: "Ficha de nota — Afonso" },
      { property: "og:description", content: "Memória organizada por observação." },
    ],
  }),
  component: DiversoDetail,
});

function DiversoDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["misc", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("miscellaneous_items")
        .select("id, title, original_content, summary, category, source_channel, status, tags, related_person_id, related_property_id, created_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as MiscItem;
      // Segunda rede contra JSON bruto (registos antigos / regressões).
      return {
        ...row,
        title: humanizeMiscTitle(row.title),
        original_content: row.original_content ? humanizeMiscText(row.original_content) : null,
        summary: row.summary ? humanizeMiscText(row.summary) : null,
      } as MiscItem;
    },
  });

  const [title, setTitle] = useState("");
  const [original, setOriginal] = useState("");
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState<Status>("inbox");
  const [tagsText, setTagsText] = useState("");

  useEffect(() => {
    if (!q.data) return;
    setTitle(q.data.title ?? "");
    setOriginal(q.data.original_content ?? "");
    setSummary(q.data.summary ?? "");
    setStatus(q.data.status);
    setTagsText((q.data.tags ?? []).join(", "));
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const tags = tagsText.split(",").map((s) => s.trim()).filter(Boolean);
      const clean = sanitizeMiscFields({
        title: title.trim() || "Sem título",
        original_content: original.trim() || null,
        summary: summary.trim() || null,
      });
      const { error } = await supabase.from("miscellaneous_items").update({
        ...clean,
        status,
        tags: tags.length ? tags : null,
      } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alterações guardadas.");
      qc.invalidateQueries({ queryKey: ["misc"] });
      qc.invalidateQueries({ queryKey: ["misc", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao guardar."),
  });

  const setStatusOnly = useMutation({
    mutationFn: async (s: Status) => {
      const { error } = await supabase.from("miscellaneous_items").update({ status: s } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["misc"] });
      qc.invalidateQueries({ queryKey: ["misc", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro."),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("miscellaneous_items").update({ status: "deleted" } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nota eliminada.");
      qc.invalidateQueries({ queryKey: ["misc"] });
      navigate({ to: "/diversos" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro."),
  });

  if (q.isLoading) {
    return <AppShell><PageHeader title="A carregar…" /></AppShell>;
  }
  if (!q.data) {
    return (
      <AppShell>
        <PageHeader title="Nota não encontrada" subtitle="Pode ter sido eliminada." />
        <Button variant="ghost" onClick={() => navigate({ to: "/diversos" })}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
        </Button>
      </AppShell>
    );
  }

  const item = q.data;
  const dirty =
    title !== (item.title ?? "") ||
    original !== (item.original_content ?? "") ||
    summary !== (item.summary ?? "") ||
    status !== item.status ||
    tagsText !== (item.tags ?? []).join(", ");

  return (
    <AppShell>
      <div className="mb-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/diversos" })}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Diversos
        </Button>
      </div>
      <PageHeader
        title={item.title || "Sem título"}
        subtitle={new Date(item.created_at).toLocaleString("pt-PT")}
        action={
          <div className="flex gap-2">
            {item.status !== "reviewed" && item.status !== "classified" && (
              <Button variant="outline" onClick={() => setStatusOnly.mutate("reviewed")}>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Marcar como revisto
              </Button>
            )}
            {item.status !== "archived" && (
              <Button variant="ghost" onClick={() => setStatusOnly.mutate("archived")}>
                <Archive className="mr-1 h-4 w-4" /> Arquivar
              </Button>
            )}
            <Button variant="ghost" className="text-destructive" onClick={() => { if (confirm("Eliminar esta nota?")) remove.mutate(); }}>
              <Trash2 className="mr-1 h-4 w-4" /> Eliminar
            </Button>
            <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
              <Save className="mr-1 h-4 w-4" /> Guardar
            </Button>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">{STATUS_LABEL[item.status]}</Badge>
        <Badge variant="secondary" className="uppercase">{item.source_channel}</Badge>
        {(item.tags ?? []).map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
      </div>

      <Card className="mb-4">
        <CardContent className="space-y-2 p-4">
          <h3 className="text-sm font-semibold">Porque está aqui</h3>
          <p className="text-sm">
            {miscReason(item).label} — <span className="text-muted-foreground">{miscReason(item).detail}</span>
          </p>
          <MiscActions item={item} />
          <MiscLinkedBadges
            personId={item.related_person_id}
            propertyId={item.related_property_id}
            className="pt-1"
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-semibold">Conteúdo</h3>
            <div className="grid gap-2">
              <Label htmlFor="t">Título</Label>
              <Input id="t" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="o">Original</Label>
              <Textarea id="o" rows={6} value={original} onChange={(e) => setOriginal(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="s">Resumo</Label>
              <Textarea id="s" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-semibold">Classificação</h3>
            <div className="grid gap-2">
              <Label>Estado</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTS.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tags">Etiquetas (separadas por vírgula)</Label>
              <Input id="tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="ex: ideia, marketing" />
            </div>
            <div className="text-xs text-muted-foreground">
              Canal de origem: <strong className="text-foreground">{item.source_channel}</strong>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}