import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { listProperties, deleteProperty } from "@/lib/assessor/properties.functions";
import { propertyStatusLabel } from "@/lib/assessor/properties-status";
import { AlertTriangle, Download, Plus, Search } from "lucide-react";
import { TierGate } from "@/components/tier-gate";
import { EditPropertyDialog } from "@/components/imoveis/edit-property-dialog";
import { NewPropertyDialog } from "@/components/imoveis/new-property-dialog";
import { OrganizeDialog, useOrganizer } from "@/components/organizer/organizer";
import { GroupCards, ViewToggle, type PeopleView } from "@/components/pessoas/people-explorer";
import { ORIGEM, PropertyCard } from "@/components/imoveis/properties-explorer";
import { PropertyCategoryDialog, PropertyCategoryFilter, usePropertyCategories } from "@/components/imoveis/property-categories";
import { FilterSection } from "@/components/organizer/filter-section";
import { toast } from "sonner";
import { exportProperties } from "@/lib/export/export.functions";
import { csvDate, dateStamp, downloadText, toCsv } from "@/lib/export/download";
import { getPropertyAttention } from "@/lib/imoveis/attention.functions";
import { assuntoDeImovel } from "@/lib/assessor/assunto";
import { AssuntoCard } from "@/components/assunto-card";

export const Route = createFileRoute("/_authenticated/imoveis/")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    cat: typeof search.cat === "string" && search.cat ? search.cat : undefined,
    view: search.view === "grelha" ? ("grelha" as const) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Imóveis — Afonso" },
      { name: "description", content: "Carteira de imóveis em angariação." },
      { property: "og:title", content: "Imóveis — Afonso" },
      { property: "og:description", content: "Carteira de imóveis em angariação." },
    ],
  }),
  component: () => (
    <TierGate min="consultor" title="Imóveis">
      <ImoveisPage />
    </TierGate>
  ),
});

function ImoveisPage() {
  const fetchList = useServerFn(listProperties);
  const qc = useQueryClient();
  const remove = useServerFn(deleteProperty);
  const { data: rows, isLoading } = useQuery({ queryKey: ["properties", "list"], queryFn: () => fetchList() });
  const all = (rows ?? []) as any[];

  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/imoveis" });
  const q = search.q ?? "";
  const catId = search.cat ?? null;
  const view: PeopleView = search.view ?? "lista";
  const setQ = (v: string) =>
    navigate({ search: (p: Record<string, unknown>) => ({ ...p, q: v || undefined }), replace: true });
  const setCatId = (v: string | null) =>
    navigate({ search: (p: Record<string, unknown>) => ({ ...p, cat: v ?? undefined }), replace: true });
  const setView = (v: PeopleView) =>
    navigate({ search: (p: Record<string, unknown>) => ({ ...p, view: v === "grelha" ? "grelha" : undefined }), replace: true });

  const [editId, setEditId] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [catFor, setCatFor] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const org = useOrganizer("property");
  const cats = usePropertyCategories();
  const emEdicao = all.find((p) => p.id === editId) ?? null;
  const fetchExport = useServerFn(exportProperties);
  const fetchAttention = useServerFn(getPropertyAttention);
  const [aExportar, setAExportar] = useState(false);

  const atencao = useQuery({ queryKey: ["property-attention"], queryFn: () => fetchAttention() });

  // "Em carteira" usa a mesma régua de /hoje: exclui vendidos e arquivados.
  // A lista continua a mostrar tudo — só o contador é que fica alinhado.
  const emCarteira = all.filter(
    (p) => !["vendido", "arquivado"].includes(String(p.status ?? "").toLowerCase()),
  ).length;

  // Todos pré-selecionados por defeito; imóveis novos entram na seleção.
  useEffect(() => {
    setSel(new Set(all.map((p) => p.id)));
  }, [all.length]);

  const toggle = (id: string) =>
    setSel((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function eliminar(id: string, titulo: string) {
    if (!confirm(`Apagar "${titulo}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await remove({ data: { id } });
      await qc.invalidateQueries({ queryKey: ["properties"] });
      toast.success("Imóvel eliminado.");
    } catch (e) { toast.error((e as Error).message); }
  }

  async function exportarCsv() {
    setAExportar(true);
    try {
      const todos = await fetchExport();
      const linhas = todos.filter((r: any) => sel.has(r.id));
      if (!linhas.length) { toast.error("Não há imóveis selecionados."); return; }
      const csv = toCsv(
        ["Morada", "Tipo", "Estado", "Preço (EUR)", "Origem", "Criado em"],
        linhas.map((r: any) => [
          [r.address, r.city || r.location].filter(Boolean).join(", ") || r.title || "",
          [r.typology, r.property_type].filter(Boolean).join(" "),
          propertyStatusLabel(r.status),
          r.asking_price ?? r.value ?? "",
          r.source_channel ? (ORIGEM[r.source_channel] ?? r.source_channel) : "",
          csvDate(r.created_at),
        ]),
      );
      downloadText(`imoveis-afonso-${dateStamp()}.csv`, "text/csv", csv);
    } finally {
      setAExportar(false);
    }
  }

  const term = q.trim().toLowerCase();
  const list = useMemo(() => all.filter((i) => {
    if (catId && i.category_id !== catId) return false;
    if (!term) return true;
    return [i.title, i.address, i.city, i.location, i.typology, i.property_type]
      .filter(Boolean).join(" ").toLowerCase().includes(term);
  }), [all, catId, term]);

  const aviso = atencao.data;

  // Quantos imóveis por categoria — as mais usadas aparecem primeiro no filtro.
  const usoCategorias = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of all) if (p.category_id) m[p.category_id] = (m[p.category_id] ?? 0) + 1;
    return m;
  }, [all]);

  return (
    <AppShell>
      <PageHeader
        title="Imóveis"
        subtitle={`${emCarteira} em carteira · criados aqui ou por conversa`}
        action={
          <button type="button" className="c-btn tap-44" onClick={() => setNovo(true)}>
            <Plus className="h-4 w-4" /> Adicionar
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" className="c-btn tap-44" onClick={exportarCsv} disabled={aExportar}>
          <Download className="h-4 w-4" /> {aExportar ? "A gerar…" : `CSV (${sel.size})`}
        </button>
      </div>

      {aviso && (
        <section className="c-spotlight mb-4">
          <AssuntoCard
            destaque
            tag={<><AlertTriangle className="h-4 w-4" /> Isto merece atenção</>}
            {...assuntoDeImovel(aviso)}
          />
        </section>
      )}

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--muted)" }} />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Procurar por morada ou tipo…"
          className="h-11 rounded-xl pl-9"
          style={{ background: "#fff", borderColor: "var(--line)" }}
        />
      </div>

      <div className="mb-6 flex flex-col gap-2">
        <FilterSection
          title="Categoria"
          count={cats.categories.length}
          activeLabel={catId ? (cats.byId(catId)?.name ?? null) : null}
          onClearActive={() => setCatId(null)}
        >
          <PropertyCategoryFilter selected={catId} onSelect={setCatId} usage={usoCategorias} hideHeading />
        </FilterSection>
        <FilterSection title="Grupos" count={org.folders.length}>
          <GroupCards
            org={org}
            items={all.map((i) => ({ id: i.id, label: i.title as string }))}
            noun={["imóvel", "imóveis"]}
            emptyLabel="Sem imóveis ainda"
            hideHeading
          />
        </FilterSection>
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Toda a carteira</div>
        <ViewToggle view={view} onView={setView} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px]" style={{ color: "var(--muted)" }}>
        <span>{sel.size} de {all.length} selecionado{sel.size === 1 ? "" : "s"}</span>
        <span className="flex items-center gap-2">
          <button type="button" className="tap-44 font-semibold" style={{ color: "var(--ink-soft)" }} onClick={() => setSel(new Set(all.map((p) => p.id)))}>Selecionar tudo</button>
          <span>·</span>
          <button type="button" className="tap-44 font-semibold" style={{ color: "var(--ink-soft)" }} onClick={() => setSel(new Set())}>Limpar seleção</button>
        </span>
      </div>

      {isLoading && all.length === 0 && <p className="c-muted text-sm">A carregar…</p>}
      {!isLoading && all.length === 0 && (
        <div className="c-empty">
          Ainda não tens imóveis. Usa "+ Adicionar" ou descreve o imóvel ao teu assessor por WhatsApp.
        </div>
      )}
      {all.length > 0 && list.length === 0 && (
        <div className="c-empty">Nenhum imóvel corresponde à procura.</div>
      )}

      <div className={view === "grelha" ? "grid min-w-0 grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4" : "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 sm:gap-3"}>
        {list.map((i: any) => (
          <PropertyCard
            key={i.id} i={i} org={org} view={view}
            selected={sel.has(i.id)}
            onToggle={() => toggle(i.id)}
            onEdit={() => setEditId(i.id)}
            onOrganize={() => setOrgId(i.id)}
            onCategory={() => setCatFor(i.id)}
            category={cats.byId(i.category_id)}
            onDelete={() => void eliminar(i.id, i.title)}
          />
        ))}
      </div>

      <EditPropertyDialog property={emEdicao} open={!!emEdicao} onOpenChange={(v) => { if (!v) setEditId(null); }} />
      <PropertyCategoryDialog
        propertyId={catFor}
        propertyTitle={all.find((p) => p.id === catFor)?.title ?? ""}
        currentId={all.find((p) => p.id === catFor)?.category_id ?? null}
        open={!!catFor}
        onOpenChange={(v) => { if (!v) setCatFor(null); }}
      />
      <NewPropertyDialog open={novo} onOpenChange={setNovo} />
      <OrganizeDialog
        entityType="property" entityId={orgId}
        title={all.find((p) => p.id === orgId)?.title ?? ""}
        org={org} open={!!orgId} onOpenChange={(v) => { if (!v) setOrgId(null); }} hideTags
      />
    </AppShell>
  );
}
