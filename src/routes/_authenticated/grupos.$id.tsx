import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { EditPersonDialog } from "@/components/pessoas/edit-person-dialog";
import { OrganizeDialog, useOrganizer } from "@/components/organizer/organizer";
import { PersonCard, ViewToggle, type PeopleView } from "@/components/pessoas/people-explorer";

export const Route = createFileRoute("/_authenticated/grupos/$id")({
  head: () => ({
    meta: [
      { title: "Grupo — Afonso" },
      { name: "description", content: "As pessoas deste grupo, com contactos e etiquetas." },
      { property: "og:title", content: "Grupo — Afonso" },
      { property: "og:description", content: "As pessoas deste grupo, com contactos e etiquetas." },
    ],
  }),
  component: GrupoPage,
});

function GrupoPage() {
  const { id } = Route.useParams();
  const { pessoas, deletePessoa } = useStore();
  const org = useOrganizer("person");
  const [view, setView] = useState<PeopleView>("lista");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [editId, setEditId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  const grupo = org.folders.find((f) => f.id === id) ?? null;
  const cor = grupo?.color ?? "#79766A";
  const membros = pessoas.filter((p) => org.foldersOf(p.id).some((f) => f.id === id));

  const toggle = (pid: string) =>
    setSel((cur) => { const n = new Set(cur); n.has(pid) ? n.delete(pid) : n.add(pid); return n; });

  async function eliminar(pid: string, nome: string) {
    if (!confirm(`Apagar ${nome}? Esta ação não pode ser desfeita.`)) return;
    try { await deletePessoa(pid); toast.success("Pessoa eliminada."); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <AppShell>
      <Link to="/pessoas" className="tap-44 mb-2 inline-flex items-center gap-1 text-[13px] font-semibold" style={{ color: "var(--muted)" }}>
        <ChevronLeft className="h-4 w-4" /> Pessoas
      </Link>
      <div className="mb-4 rounded-xl border p-4" style={{ borderColor: "var(--line)", borderLeft: `4px solid ${cor}`, background: `color-mix(in srgb, ${cor} 10%, #fff)` }}>
        <PageHeader
          title={grupo?.name ?? "Grupo"}
          subtitle={`${membros.length} pessoa${membros.length === 1 ? "" : "s"} neste grupo`}
          action={<ViewToggle view={view} onView={setView} />}
        />
      </div>

      {membros.length === 0 && (
        <div className="c-empty">Ainda não há ninguém neste grupo. Usa "Organizar" num contacto para o juntares aqui.</div>
      )}

      <div className={view === "grelha" ? "grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid gap-3"}>
        {membros.map((p) => (
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

      <EditPersonDialog
        pessoa={pessoas.find((p) => p.id === editId) ?? null}
        open={!!editId} onOpenChange={(v) => { if (!v) setEditId(null); }}
      />
      <OrganizeDialog
        entityType="person" entityId={orgId}
        title={pessoas.find((p) => p.id === orgId)?.nome ?? ""}
        org={org} open={!!orgId} onOpenChange={(v) => { if (!v) setOrgId(null); }}
      />
    </AppShell>
  );
}
