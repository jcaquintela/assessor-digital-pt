import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Download, Plus, Search } from "lucide-react";
import { EditPersonDialog } from "@/components/pessoas/edit-person-dialog";
import { NewPersonDialog } from "@/components/pessoas/new-person-dialog";
import { OrganizeDialog, useOrganizer } from "@/components/organizer/organizer";
import {
  GroupCards, PersonCard, TagFilterRow, ViewToggle, type PeopleView,
} from "@/components/pessoas/people-explorer";
import { FilterSection } from "@/components/organizer/filter-section";
import { usePersistedView } from "@/lib/ui/view-pref";
import { PresetRow } from "@/components/organizer/preset-row";
import {
  PEOPLE_PRESETS, isPeoplePreset, matchPeoplePreset, usePersistedPreset, type PeoplePreset,
} from "@/lib/ui/presets";
import { toast } from "sonner";
import { exportPeople } from "@/lib/export/export.functions";
import { getPersonAttention } from "@/lib/people/attention.functions";
import { assuntoDePessoa } from "@/lib/assessor/assunto";
import { AssuntoCard } from "@/components/assunto-card";
import { buildVCards, csvDate, dateStamp, downloadText, toCsv } from "@/lib/export/download";

export const Route = createFileRoute("/_authenticated/pessoas/")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    tag: typeof search.tag === "string" && search.tag ? search.tag : undefined,
    view: search.view === "grelha" ? ("grelha" as const) : undefined,
    preset: isPeoplePreset(search.preset) ? search.preset : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Pessoas — Afonso" },
      { name: "description", content: "Clientes, potenciais, proprietários e referenciadores." },
      { property: "og:title", content: "Pessoas — Afonso" },
      { property: "og:description", content: "Clientes, potenciais, proprietários e referenciadores." },
    ],
  }),
  component: PessoasPage,
});

function PessoasPage() {
  const { pessoas, loading, deletePessoa } = useStore();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/pessoas" });
  const q = search.q ?? "";
  const tagId = search.tag ?? null;
  const view: PeopleView = search.view ?? "lista";
  const preset: PeoplePreset = search.preset ?? "todos";
  const setQ = (v: string) =>
    navigate({ search: (p: Record<string, unknown>) => ({ ...p, q: v || undefined }), replace: true });
  const setTagId = (v: string | null) =>
    navigate({ search: (p: Record<string, unknown>) => ({ ...p, tag: v ?? undefined }), replace: true });
  const setView = (v: PeopleView) =>
    navigate({ search: (p: Record<string, unknown>) => ({ ...p, view: v === "grelha" ? "grelha" : undefined }), replace: true });
  usePersistedView(view, setView, search.view !== undefined);
  const setPreset = (v: PeoplePreset) =>
    navigate({ search: (p: Record<string, unknown>) => ({ ...p, preset: v === "todos" ? undefined : v }), replace: true });
  usePersistedPreset("afonso.preset.pessoas", preset, setPreset, search.preset !== undefined, isPeoplePreset);
  const [editId, setEditId] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const org = useOrganizer("person");
  const emEdicao = pessoas.find((p) => p.id === editId) ?? null;
  const fetchPeople = useServerFn(exportPeople);
  const fetchAttention = useServerFn(getPersonAttention);
  const [aExportar, setAExportar] = useState<"csv" | "vcf" | null>(null);

  const atencao = useQuery({ queryKey: ["person-attention"], queryFn: () => fetchAttention() });

  // Todas pré-selecionadas por defeito; novas pessoas entram na seleção.
  useEffect(() => {
    setSel(new Set(pessoas.map((p) => p.id)));
  }, [pessoas.length]);

  const toggle = (id: string) =>
    setSel((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function eliminar(id: string, nome: string) {
    if (!confirm(`Apagar ${nome}? Esta ação não pode ser desfeita.`)) return;
    try { await deletePessoa(id); toast.success("Pessoa eliminada."); }
    catch (e) { toast.error((e as Error).message); }
  }

  async function exportar(tipo: "csv" | "vcf") {
    setAExportar(tipo);
    try {
      const todas = await fetchPeople();
      const rows = todas.filter((p) => sel.has(p.id));
      if (!rows.length) { toast.error("Não há ninguém selecionado."); return; }
      const stamp = dateStamp();
      if (tipo === "csv") {
        const csv = toCsv(
          ["Nome", "Telefone", "Email", "Relação", "Notas", "Criado em"],
          rows.map((p) => [p.name, p.phone, p.email, p.relationship_type, p.summary, csvDate(p.created_at)]),
        );
        downloadText(`pessoas-afonso-${stamp}.csv`, "text/csv", csv);
      } else {
        const vcf = buildVCards(rows.map((p) => ({ name: p.name, phone: p.phone, email: p.email, note: p.summary })));
        downloadText(`contactos-afonso-${stamp}.vcf`, "text/vcard", vcf);
      }
    } finally {
      setAExportar(null);
    }
  }

  const term = q.trim().toLowerCase();
  const digits = term.replace(/\D/g, "");
  const filtradas = useMemo(() => pessoas.filter((p) => {
    if (!matchPeoplePreset(p, preset)) return false;
    if (tagId && !org.tagsOf(p.id).some((t) => t.id === tagId)) return false;
    if (!term) return true;
    const byText = (p.nome + " " + p.email + " " + p.resumo).toLowerCase().includes(term);
    const byPhone = digits.length >= 3 && p.telefone.replace(/\D/g, "").includes(digits);
    return byText || byPhone;
  }), [pessoas, tagId, term, digits, preset, org.tagLinks, org.tags]);

  const contagens = useMemo(() => {
    const c: Record<string, number> = {};
    for (const def of PEOPLE_PRESETS) c[def.id] = pessoas.filter((p) => matchPeoplePreset(p, def.id)).length;
    return c;
  }, [pessoas]);

  const aviso = atencao.data;

  return (
    <AppShell>
      <PageHeader
        title="Pessoas"
        subtitle={`${pessoas.length} contacto${pessoas.length === 1 ? "" : "s"} · criados aqui ou por conversa`}
        action={
          <button type="button" className="c-btn tap-44" onClick={() => setNovo(true)}>
            <Plus className="h-4 w-4" /> Adicionar
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" className="c-btn tap-44" onClick={() => exportar("csv")} disabled={aExportar !== null}>
          <Download className="h-4 w-4" /> {aExportar === "csv" ? "A gerar…" : `CSV (${sel.size})`}
        </button>
        <button type="button" className="c-btn tap-44" onClick={() => exportar("vcf")} disabled={aExportar !== null}>
          <Download className="h-4 w-4" /> {aExportar === "vcf" ? "A gerar…" : `Contactos .vcf (${sel.size})`}
        </button>
      </div>

      {aviso && (
        <section className="c-spotlight mb-4">
          <AssuntoCard
            destaque
            tag={<><AlertTriangle className="h-4 w-4" /> Isto merece atenção</>}
            {...assuntoDePessoa(aviso)}
          />
        </section>
      )}

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--muted)" }} />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Procurar por nome ou telefone…"
          className="h-11 rounded-xl pl-9"
          style={{ background: "#fff", borderColor: "var(--line)" }}
        />
      </div>

      <div className="mb-6 flex flex-col gap-2">
        <PresetRow presets={PEOPLE_PRESETS} value={preset} onChange={setPreset} counts={contagens} />
        <FilterSection
          title="Etiquetas"
          count={org.tags.length}
          activeLabel={tagId ? (org.tags.find((t) => t.id === tagId)?.name ?? null) : null}
          onClearActive={() => setTagId(null)}
        >
          <TagFilterRow org={org} tagId={tagId} onTag={setTagId} hideHeading />
        </FilterSection>
        <FilterSection title="Grupos" count={org.folders.length}>
          <GroupCards org={org} pessoas={pessoas} hideHeading />
        </FilterSection>
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Todos os contactos</div>
        <ViewToggle view={view} onView={setView} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px]" style={{ color: "var(--muted)" }}>
        <span>{sel.size} de {pessoas.length} selecionado{sel.size === 1 ? "" : "s"}</span>
        <span className="flex items-center gap-2">
          <button type="button" className="tap-44 font-semibold" style={{ color: "var(--ink-soft)" }} onClick={() => setSel(new Set(pessoas.map((p) => p.id)))}>Selecionar tudo</button>
          <span>·</span>
          <button type="button" className="tap-44 font-semibold" style={{ color: "var(--ink-soft)" }} onClick={() => setSel(new Set())}>Limpar seleção</button>
        </span>
      </div>

      {loading && pessoas.length === 0 && <p className="c-muted text-sm">A carregar…</p>}
      {!loading && pessoas.length === 0 && (
        <div className="c-empty">Ainda não tens contactos. Usa "+ Adicionar" ou fala com o teu assessor por WhatsApp.</div>
      )}
      {!loading && pessoas.length > 0 && filtradas.length === 0 && (
        <div className="c-empty">Nenhum contacto corresponde a esta vista.</div>
      )}

      <div className={view === "grelha" ? "grid min-w-0 grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4" : "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 sm:gap-3"}>
        {filtradas.map((p) => (
          <PersonCard
            key={p.id} p={p} org={org} view={view}
            selected={sel.has(p.id)}
            onToggle={() => toggle(p.id)}
            onEdit={() => setEditId(p.id)}
            onOrganize={() => setOrgId(p.id)}
            onDelete={() => void eliminar(p.id, p.nome)}
          />
        ))}
      </div>

      <EditPersonDialog pessoa={emEdicao} open={!!emEdicao} onOpenChange={(v) => { if (!v) setEditId(null); }} />
      <NewPersonDialog open={novo} onOpenChange={setNovo} onCreated={() => setNovo(false)} />
      <OrganizeDialog
        entityType="person" entityId={orgId}
        title={pessoas.find((p) => p.id === orgId)?.nome ?? ""}
        org={org} open={!!orgId} onOpenChange={(v) => { if (!v) setOrgId(null); }}
      />
    </AppShell>
  );
}
