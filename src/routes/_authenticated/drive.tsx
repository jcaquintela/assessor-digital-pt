import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  validateSearch: (s: Record<string, unknown>): { tab?: Tab; q?: string } => ({
    tab: (s.tab as Tab | undefined) ?? undefined,
    q: (s.q as string | undefined) ?? undefined,
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

const CANAL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  web: "Dashboard",
};

function DrivePage() {
  const search = Route.useSearch();
  const tab: Tab = (search.tab ?? "recentes") as Tab;
  const qParam = search.q ?? "";
  const navigate = Route.useNavigate();
  const [q, setQ] = useState(qParam);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchList = useServerFn(listDriveFiles);
  const fetchCounts = useServerFn(driveCounts);
  const upload = useServerFn(uploadDriveFile);

  const listQ = useQuery({
    queryKey: ["drive", "list", tab, qParam],
    queryFn: () => fetchList({ data: { tab, q: qParam } }),
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
          const active = tab === t.key;
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
              className={"c-pill shrink-0" + (active ? " active" : "")}
            >
              {t.label}
              {typeof count === "number" && count > 0 && (
                <span className="ml-1.5 text-xs opacity-70">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {listQ.isLoading && <div className="c-muted text-sm">A carregar…</div>}

      {!listQ.isLoading && files.length === 0 && (
        <div className="c-empty">
          {tab === "por_tratar"
            ? "Nada por tratar. Bom trabalho."
            : "Sem ficheiros nesta vista. Envia pelo WhatsApp ou usa Carregar."}
        </div>
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
            <Link key={f.id} to="/drive/$id" params={{ id: f.id }} className="c-card c-card-hover block p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <Icon className="c-muted mt-0.5 h-5 w-5 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-[14px] font-semibold">
                        {f.original_file_name ?? "Ficheiro"}
                      </div>
                      {needsReview && (
                        <span className="c-badge warn">
                          <AlertCircle className="h-3 w-3" /> Por tratar
                        </span>
                      )}
                    </div>
                    <div className="c-muted mt-1 text-[11.5px]">
                      {f.document_type ?? f.classification ?? "Ficheiro"} ·{" "}
                      <span className="c-mono">{formatDate(f.created_at)}</span> ·{" "}
                      <span className="c-mono">{formatSize(f.size_bytes ?? 0)}</span> · recebido via{" "}
                      {CANAL_LABEL[f.channel] ?? f.channel}
                    </div>
                    {links.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="c-muted text-[11px]">Ligado a</span>
                        {links.slice(0, 3).map((l) => (
                          <span key={l.entity_id + l.entity_type} className="c-badge">
                            {ENTITY_LABEL[l.entity_type] ?? l.entity_type}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Promessa visível do Drive Inteligente (flag drive.v1, ainda sem leitor no motor). */}
      <div className="c-note mt-5">
        Drive Inteligente a caminho — um ficheiro poderá ligar-se a mais do que um registo
        (ex.: uma escritura ligada à Pessoa e ao Imóvel ao mesmo tempo).
      </div>
    </AppShell>
  );
}