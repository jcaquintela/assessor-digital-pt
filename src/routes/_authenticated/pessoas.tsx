import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { formatData } from "@/lib/demo-data";
import { ChevronRight, Download, Pencil, Plus, Search, Tags, Trash2 } from "lucide-react";
import { EditPersonDialog } from "@/components/pessoas/edit-person-dialog";
import { NewPersonDialog } from "@/components/pessoas/new-person-dialog";
import { OrganizerFilter, OrganizeDialog, useOrganizer } from "@/components/organizer/organizer";
import { toast } from "sonner";
import { exportPeople } from "@/lib/export/export.functions";
import { buildVCards, csvDate, dateStamp, downloadText, toCsv } from "@/lib/export/download";

export const Route = createFileRoute("/_authenticated/pessoas")({
  head: () => ({
    meta: [
      { title: "Pessoas — Assessor do Consultor" },
      { name: "description", content: "Clientes, potenciais, proprietários e referenciadores." },
      { property: "og:title", content: "Pessoas — Assessor do Consultor" },
      { property: "og:description", content: "Clientes, potenciais, proprietários e referenciadores." },
    ],
  }),
  component: PessoasPage,
});

function PessoasPage() {
  const { pessoas, loading, deletePessoa } = useStore();
  const [q, setQ] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [tagId, setTagId] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const org = useOrganizer("person");
  const emEdicao = pessoas.find((p) => p.id === editId) ?? null;
  const fetchPeople = useServerFn(exportPeople);
  const [aExportar, setAExportar] = useState<"csv" | "vcf" | null>(null);

  async function eliminar(id: string, nome: string) {
    if (!confirm(`Apagar ${nome}? Esta ação não pode ser desfeita.`)) return;
    try { await deletePessoa(id); toast.success("Pessoa eliminada."); }
    catch (e) { toast.error((e as Error).message); }
  }

  async function exportar(tipo: "csv" | "vcf") {
    setAExportar(tipo);
    try {
      const rows = await fetchPeople();
      const stamp = dateStamp();
      if (tipo === "csv") {
        const csv = toCsv(
          ["Nome", "Telefone", "Email", "Relação", "Notas", "Criado em"],
          rows.map((p) => [p.name, p.phone, p.email, p.relationship_type, p.summary, csvDate(p.created_at)]),
        );
        downloadText(`pessoas-afonso-${stamp}.csv`, "text/csv", csv);
      } else {
        const vcf = buildVCards(
          rows.map((p) => ({ name: p.name, phone: p.phone, email: p.email, note: p.summary })),
        );
        downloadText(`contactos-afonso-${stamp}.vcf`, "text/vcard", vcf);
      }
    } finally {
      setAExportar(null);
    }
  }

  const term = q.trim().toLowerCase();
  const digits = term.replace(/\D/g, "");
  const filtradas = pessoas.filter((p) => {
    if (tagId && !org.tagsOf(p.id).some((t) => t.id === tagId)) return false;
    if (folderId && !org.foldersOf(p.id).some((f) => f.id === folderId)) return false;
    if (!term) return true;
    const byText = (p.nome + " " + p.email + " " + p.resumo).toLowerCase().includes(term);
    const byPhone = digits.length >= 3 && p.telefone.replace(/\D/g, "").includes(digits);
    return byText || byPhone;
  });

  return (
    <AppShell>
      <PageHeader
        title="Pessoas"
        subtitle={`${pessoas.length} contacto${pessoas.length === 1 ? "" : "s"} · criados aqui ou por conversa`}
        action={
          <button type="button" className="c-btn" onClick={() => setNovo(true)}>
            <Plus className="h-4 w-4" /> Adicionar
          </button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" className="c-btn" onClick={() => exportar("csv")} disabled={aExportar !== null}>
          <Download className="h-4 w-4" /> {aExportar === "csv" ? "A gerar…" : "CSV"}
        </button>
        <button type="button" className="c-btn" onClick={() => exportar("vcf")} disabled={aExportar !== null}>
          <Download className="h-4 w-4" /> {aExportar === "vcf" ? "A gerar…" : "Contactos (.vcf)"}
        </button>
      </div>
      <div className="mb-4">
        <OrganizerFilter
          entityType="person" org={org}
          tagId={tagId} folderId={folderId}
          onTag={setTagId} onFolder={setFolderId}
        />
      </div>
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
      {loading && pessoas.length === 0 && (
        <p className="c-muted text-sm">A carregar…</p>
      )}
      {!loading && pessoas.length === 0 && (
        <div className="c-empty">
          Ainda não tens contactos. Usa "+ Adicionar" ou fala com o teu assessor por WhatsApp.
        </div>
      )}
      {!loading && pessoas.length > 0 && filtradas.length === 0 && (
        <div className="c-empty">Nenhum contacto corresponde a “{q}”.</div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {filtradas.map((p) => (
          <Link key={p.id} to="/pessoas/$id" params={{ id: p.id }} className="c-card c-card-hover block p-4 text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold" style={{ color: "var(--ink)" }}>{p.nome}</div>
                <div className="c-mono c-muted mt-0.5 text-xs">
                  {[p.telefone, p.email].filter(Boolean).join(" · ") || "sem contacto"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="c-badge">{p.relacao}</span>
                <button
                  type="button"
                  aria-label={`Editar ${p.nome}`}
                  className="c-badge"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditId(p.id); }}
                >
                  <Pencil className="h-3 w-3" /> Editar
                </button>
                <button
                  type="button"
                  aria-label={`Organizar ${p.nome}`}
                  className="c-badge"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOrgId(p.id); }}
                >
                  <Tags className="h-3 w-3" /> Organizar
                </button>
                <button
                  type="button"
                  aria-label={`Eliminar ${p.nome}`}
                  className="c-badge"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); void eliminar(p.id, p.nome); }}
                >
                  <Trash2 className="h-3 w-3" /> Eliminar
                </button>
                <ChevronRight className="h-4 w-4" style={{ color: "var(--muted)" }} />
              </div>
            </div>
            {(org.tagsOf(p.id).length > 0 || org.foldersOf(p.id).length > 0) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {org.tagsOf(p.id).map((t) => <span key={t.id} className="c-badge">{t.name}</span>)}
                {org.foldersOf(p.id).map((f) => <span key={f.id} className="c-badge">{f.name}</span>)}
              </div>
            )}
            {p.resumo && <p className="c-soft mt-2 line-clamp-2 text-[13.5px]">{p.resumo}</p>}
            {p.proximaAcao && (
              <div className="mt-3 text-xs font-semibold" style={{ color: "var(--brass-dark)" }}>
                Próx.: {p.proximaAcao} {p.proximaAcaoData ? `· ${formatData(p.proximaAcaoData)}` : ""}
              </div>
            )}
          </Link>
        ))}
      </div>
      <EditPersonDialog
        pessoa={emEdicao}
        open={!!emEdicao}
        onOpenChange={(v) => { if (!v) setEditId(null); }}
      />
      <NewPersonDialog open={novo} onOpenChange={setNovo} onCreated={() => setNovo(false)} />
      <OrganizeDialog
        entityType="person"
        entityId={orgId}
        title={pessoas.find((p) => p.id === orgId)?.nome ?? ""}
        org={org}
        open={!!orgId}
        onOpenChange={(v) => { if (!v) setOrgId(null); }}
      />
    </AppShell>
  );
}