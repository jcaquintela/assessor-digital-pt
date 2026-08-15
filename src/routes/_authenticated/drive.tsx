import { MODULE_NAME, moduleTitle } from "@/lib/seo/module-names";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useDestructiveConfirm } from "@/components/support-destructive-dialog";
import { toast } from "sonner";
import {
  listDriveFiles,
  driveCounts,
  uploadDriveFile,
  deleteDriveFiles,
  restoreDriveFiles,
  driveAttention,
  driveQuotaSummary,
} from "@/lib/drive/drive.functions";
import { getUploadedFileSignedUrl } from "@/lib/assessor/files.functions";
import { useAssessorName } from "@/lib/assessor/assessor-name";
import { usePreviewTier } from "@/lib/subscription/tier-preview";
import { FixLinkDialog } from "@/components/drive/fix-link-dialog";
import { ShareWhatsAppDialog } from "@/components/drive/share-whatsapp-dialog";
import { ReorderPagesDialog } from "@/components/drive/reorder-pages-dialog";
import { QuotaUpgradeDialog } from "@/components/drive/quota-upgrade-dialog";
import { DriveFileMenu } from "@/components/drive/file-actions-menu";
import { useQuotaRevalidate } from "@/lib/drive/use-quota-revalidate";
import {
  pendingUploadCount,
  queuePendingUpload,
  takePendingUploads,
} from "@/lib/drive/pending-uploads";

import { CategoriesBar, FileCategoryDialog, useFileCategories } from "@/components/drive/categories";
import { groupDriveFiles, type GroupBy } from "@/lib/drive/group-files";
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
  Trash2,
  Undo2,
  MessageCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ListOrdered,
} from "lucide-react";

type Tab =
  | "recentes"
  | "por_tratar"
  | "imoveis"
  | "pessoas"
  | "diversos"
  | "arquivados"
  | "reciclagem";

export const Route = createFileRoute("/_authenticated/drive")({
  head: () => ({
    meta: [
      { title: moduleTitle("drive") },
      { name: "description", content: "Todos os teus ficheiros, organizados automaticamente por imóvel, pessoa e oportunidade." },
      { property: "og:title", content: moduleTitle("drive") },
      { property: "og:description", content: "Todos os teus ficheiros, organizados automaticamente." },
    ],
  }),
  validateSearch: (
    s: Record<string, unknown>,
  ): { tab?: Tab; q?: string; nif?: string; artigo?: string } => ({
    tab: (s.tab as Tab | undefined) ?? undefined,
    q: (s.q as string | undefined) ?? undefined,
    nif: (s.nif as string | undefined) ?? undefined,
    artigo: (s.artigo as string | undefined) ?? undefined,
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
  { key: "reciclagem", label: "Reciclagem" },
];

// Ficheiros eliminados ficam recuperáveis durante 24 horas, com as ligações intactas.
function tempoRestante(deletedAt: string | null) {
  if (!deletedAt) return null;
  const ms = new Date(deletedAt).getTime() + 24 * 3600_000 - Date.now();
  if (ms <= 0) return "a ser apagado";
  const h = Math.floor(ms / 3600_000);
  if (h >= 1) return `${h}h`;
  return `${Math.max(1, Math.round(ms / 60_000))} min`;
}

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
  const { name: assessorName } = useAssessorName();
  const previewTier = usePreviewTier();
  const tab: Tab = (search.tab ?? "recentes") as Tab;
  const qParam = search.q ?? "";
  const navigate = Route.useNavigate();
  const [q, setQ] = useState(qParam);
  const nifParam = search.nif ?? "";
  const artigoParam = search.artigo ?? "";
  const [nif, setNif] = useState(nifParam);
  const [artigo, setArtigo] = useState(artigoParam);
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
  const [selected, setSelected] = useState<string[]>([]);
  const { categories } = useFileCategories();
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

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
    queryKey: ["drive", "list", tab, qParam, categoryId, nifParam, artigoParam],
    queryFn: () =>
      fetchList({ data: { tab, q: qParam, categoryId, nif: nifParam, artigo: artigoParam } }),
  });
  const countsQ = useQuery({
    queryKey: ["drive", "counts"],
    queryFn: () => fetchCounts(),
  });
  const fetchAttention = useServerFn(driveAttention);
  const attentionQ = useQuery({
    queryKey: ["drive", "atencao"],
    queryFn: () => fetchAttention(),
  });
  const fetchQuota = useServerFn(driveQuotaSummary);
  const quotaQ = useQuery({
    queryKey: ["drive", "quota", previewTier ?? "real"],
    queryFn: () => fetchQuota({ data: { previewTier } }),
  });
  useQuotaRevalidate();

  const quotaCheia =
    !!quotaQ.data &&
    quotaQ.data.limit !== null &&
    quotaQ.data.used >= quotaQ.data.limit;
  const [quotaBloqueio, setQuotaBloqueio] = useState(false);
  // Nome do ficheiro que ficou por carregar, para o consultor saber qual foi.
  const [ficheiroBloqueado, setFicheiroBloqueado] = useState<string | null>(null);
  const [pendentes, setPendentes] = useState(() => pendingUploadCount());
  const aRetomar = useRef(false);

  const onPickFile = () => {
    if (quotaCheia) {
      const restantes = 0;
      toast.error(
        `Limite mensal atingido: ${quotaQ.data!.used} de ${quotaQ.data!.limit} ficheiros. ${restantes} restantes.`,
      );
      setQuotaBloqueio(true);
      return;
    }
    fileRef.current?.click();
  };

  /** Guarda um ficheiro para retomar mais tarde e explica porquê. */
  const bloquearFicheiro = (f: File, motivo: string) => {
    queuePendingUpload(f);
    setPendentes(pendingUploadCount());
    setFicheiroBloqueado(f.name);
    setQuotaBloqueio(true);
    toast.error(motivo, { id: "up" });
  };

  /** Carrega um ficheiro. Devolve "ok", "quota" ou "erro". */
  const carregarFicheiro = async (f: File, silencioso = false): Promise<"ok" | "quota" | "erro"> => {
    const fd = new FormData();
    fd.append("file", f);
    try {
      toast.loading(`A carregar “${f.name}”…`, { id: "up" });
      await upload({ data: fd });
      toast.success(`Recebi “${f.name}”. Vou organizá-lo.`, { id: "up" });
      return "ok";
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg.includes("monthly_files_exceeded") || /limite mensal/i.test(msg)) {
        bloquearFicheiro(
          f,
          `“${f.name}” ficou à espera: atingiste o limite mensal de ficheiros do teu plano.`,
        );
        return "quota";
      }
      if (!silencioso) {
        toast.error(`“${f.name}” falhou: ${err?.message ?? "erro no upload."}`, { id: "up" });
      }
      return "erro";
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    if (quotaCheia) {
      bloquearFicheiro(
        f,
        `“${f.name}” ficou à espera: atingiste o limite mensal de ${quotaQ.data!.limit} ficheiros do plano ${quotaQ.data!.label}. Retomo-o assim que fizeres upgrade.`,
      );
      return;
    }
    await carregarFicheiro(f);
    listQ.refetch();
    countsQ.refetch();
    quotaQ.refetch();
  };

  /** Retoma os ficheiros que ficaram à espera, um a um. */
  const retomarPendentes = async () => {
    if (aRetomar.current) return;
    const fila = takePendingUploads();
    setPendentes(0);
    if (!fila.length) return;
    aRetomar.current = true;
    let feitos = 0;
    try {
      for (let i = 0; i < fila.length; i++) {
        const r = await carregarFicheiro(fila[i]!, true);
        if (r === "quota") {
          // Voltou a encher: o atual já foi recolocado na fila; guardar o resto.
          fila.slice(i + 1).forEach(queuePendingUpload);
          setPendentes(pendingUploadCount());
          break;
        }
        if (r === "ok") feitos++;
      }
    } finally {
      aRetomar.current = false;
      if (feitos > 0) {
        toast.success(
          feitos === 1
            ? "Retomei o ficheiro que tinha ficado à espera."
            : `Retomei ${feitos} ficheiros que tinham ficado à espera.`,
          { id: "up" },
        );
      }
      listQ.refetch();
      countsQ.refetch();
      quotaQ.refetch();
    }
  };

  // Upgrade feito (ou regresso da subscrição): quota com espaço → retomar.
  useEffect(() => {
    if (quotaQ.isFetching || quotaCheia) return;
    if (!pendingUploadCount()) return;
    setQuotaBloqueio(false);
    void retomarPendentes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotaCheia, quotaQ.isFetching]);

  const files = listQ.data?.files ?? [];
  const linksByFile = listQ.data?.linksByFile ?? {};

  const removeFiles = useServerFn(deleteDriveFiles);
  const confirmacao = useDestructiveConfirm();
  const deleteMany = useMutation({
    mutationFn: (ids: string[]) => removeFiles({ data: { ids } }),
    onSuccess: (res: any, ids) => {
      setSelected((prev) => prev.filter((id) => !ids.includes(id)));
      toast.success(
        ids.length === 1
          ? "Ficheiro eliminado."
          : `${res?.deleted ?? ids.length} ficheiros eliminados.`,
      );
      listQ.refetch();
      countsQ.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível eliminar."),
  });

  const visibleIds = useMemo(() => new Set(files.map((f: any) => f.id)), [files]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedVisible = useMemo(
    () => selected.filter((id) => visibleIds.has(id)),
    [selected, visibleIds],
  );
  const allSelected = files.length > 0 && selectedVisible.length === files.length;
  const toggleOne = (id: string, on: boolean) =>
    setSelected((prev) => (on ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));

  const restoreFiles = useServerFn(restoreDriveFiles);
  const restoreMany = useMutation({
    mutationFn: (ids: string[]) => restoreFiles({ data: { ids } }),
    onSuccess: (res: any, ids) => {
      setSelected((prev) => prev.filter((id) => !ids.includes(id)));
      toast.success(
        ids.length === 1
          ? "Ficheiro recuperado, com as ligações."
          : `${res?.restored ?? ids.length} ficheiros recuperados, com as ligações.`,
      );
      listQ.refetch();
      countsQ.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível recuperar."),
  });

  const [shareTarget, setShareTarget] = useState<{ id: string; name: string | null } | null>(null);
  const [orderTarget, setOrderTarget] = useState<string | null>(null);
  const naReciclagem = tab === "reciclagem";

  // Agrupamento da vista principal: por categoria (defeito), por negócio ou lista plana.
  const [groupBy, setGroupBy] = useState<GroupBy>("categoria");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleGroup = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  // Agrupamento memoizado: só recalcula quando a lista, as ligações, as categorias
  // ou o modo mudam — mesmo com centenas de ficheiros.
  const grupos = useMemo(
    () => groupDriveFiles(files as any[], linksByFile as any, categories, groupBy),
    [files, linksByFile, categories, groupBy],
  );

  // Listas grandes: cada secção rende por blocos, mantendo a contagem total à vista.
  // As chaves são únicas por agrupamento, por isso o "mostrar mais" de cada secção
  // sobrevive à troca de vista; só reinicia quando a lista de ficheiros muda.
  const PAGE = 40;
  const [shown, setShown] = useState<Record<string, number>>({});
  useEffect(() => {
    setShown({});
  }, [files]);

  // Trocar de agrupamento não deve fazer perder a posição na página:
  // guardamos o scroll no clique e repomo-lo depois de renderizar a nova vista.
  const scrollKeep = useRef<number | null>(null);
  const mudarAgrupamento = (next: GroupBy) => {
    if (next === groupBy) return;
    scrollKeep.current = typeof window !== "undefined" ? window.scrollY : null;
    setGroupBy(next);
  };
  useLayoutEffect(() => {
    if (scrollKeep.current == null) return;
    const y = scrollKeep.current;
    scrollKeep.current = null;
    window.scrollTo({ top: y });
  }, [groupBy]);

  const eliminar = (ids: string[], label: string) => {
    if (!ids.length || deleteMany.isPending) return;
    const ligacoes = ids.reduce(
      (n, id) => n + (((linksByFile as any)[id] ?? []).length as number),
      0,
    );
    confirmacao.pedir({
      acao: ids.length === 1 ? "Eliminar documento" : "Eliminar documentos",
      alvo: label,
      efeito: "reciclagem",
      resumo: [
        `${ids.length} ${ids.length === 1 ? "ficheiro sai" : "ficheiros saem"} do Drive Inteligente e das pesquisas.`,
        ligacoes > 0
          ? `${ligacoes} ${ligacoes === 1 ? "ligação" : "ligações"} a pessoas, imóveis ou negócios ${ligacoes === 1 ? "deixa" : "deixam"} de aparecer nas fichas.`
          : "Não há ligações a pessoas, imóveis ou negócios.",
        "A leitura automática do documento também deixa de estar disponível.",
      ],
      onConfirm: () => deleteMany.mutate(ids),
    });
  };

  const recuperar = (ids: string[]) => {
    if (!ids.length || restoreMany.isPending) return;
    restoreMany.mutate(ids);
  };

  return (
    <AppShell>
      {confirmacao.dialog}
      <PageHeader
        title={MODULE_NAME.drive}
        subtitle={`Envia. O ${assessorName} organiza.`}
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

      {quotaQ.data && quotaQ.data.limit !== null && (
        <QuotaUpgradeDialog
          used={quotaQ.data.used}
          limit={quotaQ.data.limit}
          label={quotaQ.data.label}
          hint={quotaQ.data.hint}
          preview={quotaQ.data.preview}
          open={quotaBloqueio}
          onOpenChange={setQuotaBloqueio}
          blockedFileName={ficheiroBloqueado}
          pendingCount={pendentes}
        >
          {null}
        </QuotaUpgradeDialog>
      )}

      {quotaQ.data && quotaQ.data.limit !== null && (
        <div className="mb-3 rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Ficheiros este mês</div>
              <div className="text-xs text-muted-foreground">
                Plano {quotaQ.data.label}
                {quotaQ.data.preview && (
                  <span className="ml-1.5 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    a simular
                  </span>
                )}
                <span className="ml-1.5">· reset no dia 1</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold">
                {quotaQ.data.used} de {quotaQ.data.limit}
              </div>
              {quotaQ.data.hint && (
                <div className="text-xs text-amber-600 dark:text-amber-400">
                  {quotaQ.data.hint}
                </div>
              )}
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-primary/20">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${Math.min(100, (quotaQ.data.used / quotaQ.data.limit) * 100)}%`,
              }}
            />
          </div>
          {quotaQ.data.hint && (
            <QuotaUpgradeDialog
              used={quotaQ.data.used}
              limit={quotaQ.data.limit}
              label={quotaQ.data.label}
              hint={quotaQ.data.hint}
              preview={quotaQ.data.preview}
            >
              <Button size="sm" className="mt-3 w-full sm:w-auto">
                Fazer upgrade do plano
              </Button>
            </QuotaUpgradeDialog>
          )}

        </div>
      )}

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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          value={nif}
          onChange={(e) => setNif(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") navigate({ search: (s: any) => ({ ...s, nif: nif || undefined }) });
          }}
          onBlur={() => navigate({ search: (s: any) => ({ ...s, nif: nif || undefined }) })}
          inputMode="numeric"
          placeholder="NIF do documento"
          className="h-9 w-full sm:w-48"
        />
        <Input
          value={artigo}
          onChange={(e) => setArtigo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter")
              navigate({ search: (s: any) => ({ ...s, artigo: artigo || undefined }) });
          }}
          onBlur={() => navigate({ search: (s: any) => ({ ...s, artigo: artigo || undefined }) })}
          placeholder="Artigo matricial ou fração"
          className="h-9 w-full sm:w-56"
        />
        {(nifParam || artigoParam) && (
          <button
            type="button"
            className="tap-44 text-xs underline text-muted-foreground"
            onClick={() => {
              setNif("");
              setArtigo("");
              navigate({ search: (s: any) => ({ ...s, nif: undefined, artigo: undefined }) });
            }}
          >
            Limpar filtros de documento
          </button>
        )}
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
                  : t.key === "reciclagem"
                    ? (countsQ.data as any)?.reciclagem
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

      {(attentionQ.data?.count ?? 0) > 0 && (
        <div className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Isto merece atenção
          </div>
          <ul className="space-y-1.5">
            {(attentionQ.data?.items ?? []).map((it: any) => (
              <li key={it.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                <button
                  type="button"
                  className="font-medium underline-offset-2 hover:underline"
                  onClick={() => abrirFicheiro(it.id)}
                >
                  {it.name}
                </button>
                <span className={it.level === "aviso" ? "c-muted" : "text-destructive"}>
                  {it.reason}
                </span>
                {it.linked && (
                  <span className="c-muted">
                    · {it.linked.type === "property" ? "imóvel" : "negócio"}: {it.linked.name}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {(attentionQ.data?.count ?? 0) > (attentionQ.data?.items?.length ?? 0) && (
            <div className="c-muted mt-1.5 text-xs">
              e mais {(attentionQ.data!.count as number) - (attentionQ.data!.items.length as number)} documento(s).
            </div>
          )}
        </div>
      )}

      <CategoriesBar selected={categoryId} onSelect={setCategoryId} />

      {files.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {([
            { key: "categoria", label: "Por categoria" },
            { key: "negocio", label: "Por negócio" },
            { key: "lista", label: "Lista" },
          ] as const).map((g) => (
            <button
              key={g.key}
              type="button"
              aria-pressed={groupBy === g.key}
              className={"c-pill tap-44" + (groupBy === g.key ? " active" : "")}
                onClick={() => mudarAgrupamento(g.key)}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}

      {!listQ.isLoading && files.length === 0 && (
        <div className="c-empty">
          {categoryId
            ? "Nenhum ficheiro nesta categoria."
            : tab === "reciclagem"
            ? "A reciclagem está vazia. Ficheiros eliminados ficam aqui 24 horas."
            : tab === "por_tratar"
            ? "Nada por tratar. Bom trabalho."
            : "Sem ficheiros nesta vista. Envia pelo WhatsApp ou usa Carregar."}
        </div>
      )}

      <div className="space-y-2">
        {files.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-1">
            <label className="c-muted flex cursor-pointer items-center gap-2 text-[12.5px]">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => setSelected(v === true ? files.map((f: any) => f.id) : [])}
                aria-label="Selecionar todos os ficheiros visíveis"
              />
              Selecionar tudo
            </label>
            {selectedVisible.length > 0 && (
              <>
                <span className="c-muted text-[12.5px]">
                  {selectedVisible.length} selecionado{selectedVisible.length === 1 ? "" : "s"}
                </span>
                {naReciclagem ? (
                  <button
                    type="button"
                    className="c-badge tap-44"
                    disabled={restoreMany.isPending}
                    onClick={() => recuperar(selectedVisible)}
                  >
                    <Undo2 className="h-3 w-3" /> Recuperar selecionados
                  </button>
                ) : (
                <button
                  type="button"
                  className="c-badge tap-44 text-destructive"
                  disabled={deleteMany.isPending}
                  onClick={() =>
                    eliminar(
                      selectedVisible,
                      `${selectedVisible.length} ficheiro${selectedVisible.length === 1 ? "" : "s"}`,
                    )
                  }
                >
                  <Trash2 className="h-3 w-3" /> Eliminar selecionados
                </button>
                )}
              </>
            )}
          </div>
        )}
        {grupos.map((g) => (
          <section key={g.key} className="space-y-2" data-grupo={g.key}>
            {g.label && (
              <button
                type="button"
                onClick={() => toggleGroup(g.key)}
                aria-expanded={!collapsed[g.key]}
                className={
                  "flex w-full items-center gap-2 rounded-lg px-1 py-2 text-left text-[13px] font-semibold" +
                  (g.destaque ? " text-amber-600 dark:text-amber-400" : "")
                }
              >
                {collapsed[g.key] ? (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                )}
                <span className="min-w-0 truncate">{g.label}</span>
                <span className="c-muted text-[12px] font-normal">{g.files.length}</span>
              </button>
            )}
            {(collapsed[g.key] ? [] : g.files.slice(0, shown[g.key] ?? PAGE)).map((f: any) => {
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
                  <span
                    className="mt-0.5 flex h-5 items-center"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  >
                    <Checkbox
                      checked={selectedSet.has(f.id)}
                      onCheckedChange={(v) => toggleOne(f.id, v === true)}
                      aria-label={`Selecionar ${f.original_file_name ?? "ficheiro"}`}
                    />
                  </span>
                  <Icon className="c-muted mt-0.5 h-5 w-5 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-[14px] font-semibold">
                        {f.original_file_name ?? "Ficheiro"}
                      </div>
                      {naReciclagem && (
                        <span className="c-badge warn shrink-0">
                          Recuperável durante {tempoRestante(f.deleted_at)}
                        </span>
                      )}
                      {!naReciclagem && needsReview && (
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
                        Categoria tua · sugestão do {assessorName}: {autoLabel}
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
                      <DriveFileMenu
                        label={f.original_file_name ?? "ficheiro"}
                        naReciclagem={naReciclagem}
                        temPaginas={!!f.doc_group_id}
                        paginaLabel={f.doc_page_number ? ` (pág. ${f.doc_page_number})` : ""}
                        temCategoria={!!catName}
                        onLinks={() => setFixTarget({ id: f.id, name: f.original_file_name ?? null })}
                        onPages={() => setOrderTarget(f.id)}
                        onCategory={() =>
                          setCatTarget({
                            id: f.id,
                            name: f.original_file_name ?? null,
                            auto: autoLabel,
                            current: f.custom_category_id ?? null,
                          })
                        }
                        onShare={() => setShareTarget({ id: f.id, name: f.original_file_name ?? null })}
                        onRestore={() => recuperar([f.id])}
                        onDelete={() =>
                          eliminar([f.id], `"${f.original_file_name ?? "este ficheiro"}"`)
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          );
            })}
            {!collapsed[g.key] && g.files.length > (shown[g.key] ?? PAGE) && (
              <button
                type="button"
                className="c-pill tap-44 w-full"
                onClick={() =>
                  setShown((prev) => ({ ...prev, [g.key]: (prev[g.key] ?? PAGE) + PAGE }))
                }
              >
                Mostrar mais ({g.files.length - (shown[g.key] ?? PAGE)} por ver)
              </button>
            )}
          </section>
        ))}
      </div>

      <FixLinkDialog
        fileId={fixTarget?.id ?? null}
        fileName={fixTarget?.name}
        open={!!fixTarget}
        onOpenChange={(v) => { if (!v) setFixTarget(null); }}
      />

      <ShareWhatsAppDialog
        fileId={shareTarget?.id ?? null}
        fileName={shareTarget?.name}
        open={!!shareTarget}
        onOpenChange={(v) => { if (!v) setShareTarget(null); }}
      />

      <ReorderPagesDialog
        fileId={orderTarget}
        open={!!orderTarget}
        onOpenChange={(v) => { if (!v) setOrderTarget(null); }}
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