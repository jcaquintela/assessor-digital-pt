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
import { getUploadedFileSignedUrl } from "@/lib/assessor/files.functions";
import { FixLinkDialog } from "@/components/drive/fix-link-dialog";
import { CategoriesBar, FileCategoryDialog, useFileCategories } from "@/components/drive/categories";
import {
  FileText,
  Image as ImageIcon,
  FileAudio,
  FileSpreadsheet,
  Upload,
  AlertCircle,
  Search,
  Eye,
  Link2,
  Tag,
} from "lucide-react";

type Tab = "recentes" | "por_tratar" | "imoveis" | "pessoas" | "diversos" | "arquivados";

export const Route = createFileRoute("/_authenticated/drive")({
  head: () => ({
    meta: [
      { title: "Drive — Afonso" },
      { name: "description", content: "Todos os teus ficheiros, organizados automaticamente por imóvel, pessoa e oportunidade." },
      { property: "og:title", content: "Drive — Afonso" },
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
  const signedUrl = useServerFn(getUploadedFileSignedUrl);
  const [fixTarget, setFixTarget] = useState<{ id: string; name: string | null } | null>(null);
  const [catTarget, setCatTarget] = useState<
    { id: string; name: string | null; auto: string | null; current: string | null } | null
  >(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const { categories } = useFileCategories();
  const catById = new Map(categories.map((c) => [c.id, c]));

  // "Ver": abre o documento original numa nova janela via URL assinada temporária.
  const abrirFicheiro = async (id: string) => {
    const win = window.open("", "_blank");
    try {
      const res = await signedUrl({ data: { id } });
      if (win) win.location.href = res.url;
      else window.location.href = res.url;
    } catch (e: any) {
      win?.close();
      toast.error(e?.message ?? "Não foi possível abrir o ficheiro.");
    }
  };

  const listQ = useQuery({
    queryKey: ["drive", "list", tab, qParam, categoryId],
    queryFn: () => fetchList({ data: { tab, q: qParam, categoryId } }),
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
              className={"c-pill tap-44 shrink-0" + (active ? " active" : "")}
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

      <CategoriesBar selected={categoryId} onSelect={setCategoryId} />

      {!listQ.isLoading && files.length === 0 && (
        <div className="c-empty">
          {categoryId
            ? "Nenhum ficheiro nesta categoria."
            : tab === "por_tratar"
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
          const autoLabel = f.document_type ?? f.classification ?? "Ficheiro";
          const cat = f.custom_category_id ? catById.get(f.custom_category_id) ?? null : null;
          const catName = cat?.name ?? null;
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
                      {catName && (
                        <span
                          className="c-badge shrink-0"
                          style={
                            cat?.color
                              ? {
                                  borderColor: cat.color,
                                  color: cat.color,
                                  backgroundColor: `color-mix(in srgb, ${cat.color} 12%, transparent)`,
                                }
                              : undefined
                          }
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: cat?.color ?? "currentColor" }}
                          />
                          {catName}
                        </span>
                      )}
                    </div>
                    <div className="c-muted mt-1 text-[11.5px]">
                      {autoLabel} ·{" "}
                      <span className="c-mono">{formatDate(f.created_at)}</span> ·{" "}
                      <span className="c-mono">{formatSize(f.size_bytes ?? 0)}</span> · recebido via{" "}
                      {CANAL_LABEL[f.channel] ?? f.channel}
                    </div>
                    {catName && (
                      <div className="c-muted mt-1 text-[11px]">
                        Categoria tua · sugestão do Assessor: {autoLabel}
                      </div>
                    )}
                    {links.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="c-muted text-[11px]">Ligado a</span>
                        {links.slice(0, 4).map((l) => (
                          <span key={l.entity_id + l.entity_type} className="c-badge">
                            {l.entity_name ?? ENTITY_LABEL[l.entity_type] ?? l.entity_type}
                          </span>
                        ))}
                        {links.length > 4 && (
                          <span className="c-muted text-[11px]">+{links.length - 4}</span>
                        )}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        className="c-badge tap-44"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); abrirFicheiro(f.id); }}
                      >
                        <Eye className="h-3 w-3" /> Ver
                      </button>
                      <button
                        type="button"
                        className="c-badge tap-44"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setFixTarget({ id: f.id, name: f.original_file_name ?? null });
                        }}
                      >
                        <Link2 className="h-3 w-3" /> Ligações
                      </button>
                      <button
                        type="button"
                        aria-label={`Categoria de ${f.original_file_name ?? "ficheiro"}`}
                        className="c-badge tap-44"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setCatTarget({
                            id: f.id,
                            name: f.original_file_name ?? null,
                            auto: autoLabel,
                            current: f.custom_category_id ?? null,
                          });
                        }}
                      >
                        <Tag className="h-3 w-3" /> {catName ? "Mudar categoria" : "Categoria"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <FixLinkDialog
        fileId={fixTarget?.id ?? null}
        fileName={fixTarget?.name}
        open={!!fixTarget}
        onOpenChange={(v) => { if (!v) setFixTarget(null); }}
      />

      <FileCategoryDialog
        fileId={catTarget?.id ?? null}
        fileName={catTarget?.name}
        autoLabel={catTarget?.auto}
        currentId={catTarget?.current}
        open={!!catTarget}
        onOpenChange={(v) => { if (!v) setCatTarget(null); }}
      />
    </AppShell>
  );
}