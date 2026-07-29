import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  listDriveFiles,
  driveCounts,
  uploadDriveFile,
} from "@/lib/drive/drive.functions";
import {
  FileText,
  Image as ImageIcon,
  FileAudio,
  FileSpreadsheet,
  Upload,
  AlertCircle,
  Search,
} from "lucide-react";

type Tab = "recentes" | "por_tratar" | "imoveis" | "pessoas" | "diversos" | "arquivados";

export const Route = createFileRoute("/_authenticated/drive")({
  head: () => ({
    meta: [
      { title: "Drive — Assessor do Consultor" },
      { name: "description", content: "Todos os teus ficheiros, organizados automaticamente por imóvel, pessoa e oportunidade." },
      { property: "og:title", content: "Drive — Assessor do Consultor" },
      { property: "og:description", content: "Todos os teus ficheiros, organizados automaticamente." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    tab: (s.tab as Tab) ?? "recentes",
    q: (s.q as string) ?? "",
  }),
  component: DrivePage,
});

function fileIcon(mime: string | null) {
  const m = mime ?? "";
  if (m.startsWith("image/")) return ImageIcon;
  if (m.startsWith("audio/")) return FileAudio;
  if (m.includes("sheet") || m.includes("csv")) return FileSpreadsheet;
  return FileText;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "recentes", label: "Recentes" },
  { key: "por_tratar", label: "Por tratar" },
  { key: "imoveis", label: "Imóveis" },
  { key: "pessoas", label: "Pessoas" },
  { key: "diversos", label: "Diversos" },
  { key: "arquivados", label: "Arquivados" },
];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
}

const ENTITY_LABEL: Record<string, string> = {
  person: "Pessoa",
  property: "Imóvel",
  opportunity: "Oportunidade",
  follow_up: "Seguimento",
  miscellaneous: "Diversos",
  prospecting_lead: "Prospeção",
  interaction: "Interação",
};

function DrivePage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [q, setQ] = useState(search.q);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchList = useServerFn(listDriveFiles);
  const fetchCounts = useServerFn(driveCounts);
  const upload = useServerFn(uploadDriveFile);

  const listQ = useQuery({
    queryKey: ["drive", "list", search.tab, search.q],
    queryFn: () => fetchList({ data: { tab: search.tab, q: search.q } }),
  });
  const countsQ = useQuery({
    queryKey: ["drive", "counts"],
    queryFn: () => fetchCounts(),
  });

  const onPickFile = () => fileRef.current?.click();
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    try {
      toast.loading("A carregar…", { id: "up" });
      await upload({ data: fd });
      toast.success("Recebi o ficheiro. Vou organizá-lo.", { id: "up" });
      listQ.refetch();
      countsQ.refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "Falhou o upload.", { id: "up" });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const files = listQ.data?.files ?? [];
  const linksByFile = listQ.data?.linksByFile ?? {};

  return (
    <AppShell>
      <PageHeader
        title="Drive"
        subtitle="Envia. O Assessor organiza."
        action={
          <>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={onFile}
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.vcf,audio/*"
            />
            <Button onClick={onPickFile}>
              <Upload className="mr-1.5 h-4 w-4" /> Carregar
            </Button>
          </>
        }
      />

      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") navigate({ search: (s: any) => ({ ...s, q }) });
            }}
            placeholder="Pesquisa por nome, pessoa, imóvel ou conteúdo"
            className="pl-8"
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5 overflow-x-auto">
        {TABS.map((t) => {
          const active = search.tab === t.key;
          const count =
            t.key === "recentes"
              ? countsQ.data?.recentes
              : t.key === "por_tratar"
                ? countsQ.data?.por_tratar
                : t.key === "arquivados"
                  ? countsQ.data?.arquivados
                  : undefined;
          return (
            <button
              key={t.key}
              onClick={() => navigate({ search: (s: any) => ({ ...s, tab: t.key }) })}
              className={
                "shrink-0 rounded-full border px-3 py-1 text-sm transition " +
                (active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted")
              }
            >
              {t.label}
              {typeof count === "number" && count > 0 && (
                <span className="ml-1.5 text-xs opacity-70">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {listQ.isLoading && <div className="text-sm text-muted-foreground">A carregar…</div>}

      {!listQ.isLoading && files.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {search.tab === "por_tratar"
              ? "Nada por tratar. Bom trabalho."
              : "Sem ficheiros nesta vista. Envia pelo WhatsApp ou usa Carregar."}
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {files.map((f: any) => {
          const Icon = fileIcon(f.mime_type);
          const links = (linksByFile[f.id] as any[]) ?? [];
          const needsReview =
            f.requires_review === true ||
            ["pending_classification", "awaiting_confirmation", "failed"].includes(
              f.processing_status,
            );
          return (
            <Link key={f.id} to="/drive/$id" params={{ id: f.id }} className="block">
              <Card className="transition hover:bg-muted/50">
                <CardContent className="flex items-start justify-between gap-3 p-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-medium">
                          {f.original_file_name ?? "Ficheiro"}
                        </div>
                        {needsReview && (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <AlertCircle className="h-3 w-3" /> Por tratar
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {f.document_type ?? f.classification ?? "Ficheiro"} ·{" "}
                        {formatDate(f.created_at)} · {formatSize(f.size_bytes ?? 0)} · {f.channel}
                      </div>
                      {links.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {links.slice(0, 3).map((l) => (
                            <Badge key={l.entity_id + l.entity_type} variant="secondary" className="text-xs">
                              {ENTITY_LABEL[l.entity_type] ?? l.entity_type}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}