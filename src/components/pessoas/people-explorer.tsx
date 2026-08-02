import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, ChevronRight, LayoutGrid, List, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { createFolder, createTag, deleteFolder, deleteTag } from "@/lib/organizer/organizer.functions";
import type { Organizer } from "@/components/organizer/organizer";
import type { Pessoa } from "@/lib/demo-data";

/** Mesma paleta usada no Drive. */
export const GROUP_COLORS = ["#B8863B", "#3F6B4F", "#2F5D8A", "#B8452F", "#A6741A", "#79766A"];

export const initialOf = (nome: string) => (nome.trim()[0] ?? "?").toUpperCase();

/* ---------- Etiquetas (filtro, sem cor) ---------- */

export function TagFilterRow({ org, tagId, onTag }: { org: Organizer; tagId: string | null; onTag: (id: string | null) => void }) {
  const addTag = useServerFn(createTag);
  const delTag = useServerFn(deleteTag);
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);

  async function criar() {
    setBusy(true);
    try {
      await addTag({ data: { name: nome } });
      org.refresh(); setNome(""); setOpen(false); toast.success("Etiqueta criada.");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Etiquetas</div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={`c-taglabel ${tagId === null ? "active" : ""}`} onClick={() => onTag(null)}>Todas</button>
        {org.tags.map((t) => (
          <span key={t.id} className="inline-flex items-center">
            <button type="button" className={`c-taglabel ${tagId === t.id ? "active" : ""}`} onClick={() => onTag(tagId === t.id ? null : t.id)}>
              {t.name}
            </button>
            <button
              type="button" aria-label={`Apagar etiqueta ${t.name}`} className="tap-44 ml-1 opacity-50 hover:opacity-100"
              onClick={async () => {
                if (!confirm(`Apagar a etiqueta "${t.name}"?`)) return;
                try { await delTag({ data: { id: t.id } }); org.refresh(); if (tagId === t.id) onTag(null); }
                catch (e) { toast.error((e as Error).message); }
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <button type="button" aria-label="Criar etiqueta" className="c-tagadd" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova etiqueta</DialogTitle>
            <DialogDescription>Só o nome. As etiquetas servem para filtrar.</DialogDescription>
          </DialogHeader>
          <Input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: cliente VIP" className="h-11" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={busy || !nome.trim()} onClick={criar}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Grupos: objetos com identidade e cor ---------- */

/** Itens genéricos: grupos são transversais a pessoas e imóveis. */
export type GroupItem = { id: string; label: string };

export function GroupCards({
  org, pessoas, items, noun = ["pessoa", "pessoas"], emptyLabel = "Sem pessoas ainda",
}: {
  org: Organizer;
  pessoas?: Pessoa[];
  items?: GroupItem[];
  noun?: [string, string];
  emptyLabel?: string;
}) {
  const lista: GroupItem[] = items ?? (pessoas ?? []).map((p) => ({ id: p.id, label: p.nome }));
  const addFolder = useServerFn(createFolder);
  const delFolder = useServerFn(deleteFolder);
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState(GROUP_COLORS[0]);
  const [busy, setBusy] = useState(false);

  const membros = (folderId: string) =>
    lista.filter((p) => org.foldersOf(p.id).some((f) => f.id === folderId));

  async function criar() {
    setBusy(true);
    try {
      await addFolder({ data: { name: nome, color: cor } });
      org.refresh(); setNome(""); setOpen(false); toast.success("Grupo criado.");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Os teus grupos</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {org.folders.map((f) => {
          const cor = f.color ?? "#79766A";
          const gente = membros(f.id);
          return (
            <div
              key={f.id}
              className="c-groupcard"
              style={{ borderLeftColor: cor, background: `color-mix(in srgb, ${cor} 10%, #fff)` }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="truncate text-[14.5px] font-semibold" style={{ color: "var(--ink)" }}>{f.name}</div>
                <span
                  className="shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold"
                  style={{ color: cor, background: `color-mix(in srgb, ${cor} 18%, #fff)` }}
                >
                  {gente.length} {gente.length === 1 ? noun[0] : noun[1]}
                </span>
              </div>
              <div className="mt-1 truncate text-[12.5px]" style={{ color: "var(--muted)" }}>
                {gente.length ? gente.slice(0, 3).map((p) => p.label).join(", ") : emptyLabel}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <Link to="/grupos/$id" params={{ id: f.id }} className="tap-44 text-[12.5px] font-semibold" style={{ color: "var(--sage)" }}>
                  Abrir grupo →
                </Link>
                <button
                  type="button" aria-label={`Apagar grupo ${f.name}`} className="tap-44 opacity-50 hover:opacity-100"
                  onClick={async () => {
                    if (!confirm(`Apagar o grupo "${f.name}"?`)) return;
                    try { await delFolder({ data: { id: f.id } }); org.refresh(); }
                    catch (e) { toast.error((e as Error).message); }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
        <button type="button" className="c-groupcard add" onClick={() => setOpen(true)}>+ Novo grupo</button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Novo grupo</DialogTitle>
            <DialogDescription>Dá-lhe um nome e uma cor.</DialogDescription>
          </DialogHeader>
          <Input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Angariações de Verão" className="h-11" />
          <div className="flex flex-wrap gap-3 rounded-xl p-3" style={{ background: "var(--paper-2)" }}>
            {GROUP_COLORS.map((c) => (
              <button
                key={c} type="button" aria-label={`Cor ${c}`} aria-pressed={cor === c}
                className={`tap-44 c-swatch ${cor === c ? "selected" : ""}`}
                style={{ background: c }} onClick={() => setCor(c)}
              />
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={busy || !nome.trim()} onClick={criar}>Criar grupo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Lista / grelha de pessoas ---------- */

export type PeopleView = "lista" | "grelha";

export function ViewToggle({ view, onView }: { view: PeopleView; onView: (v: PeopleView) => void }) {
  return (
    <div className="flex gap-2">
      <button type="button" className={`c-pill tap-44 ${view === "lista" ? "active" : ""}`} onClick={() => onView("lista")}>
        <List className="mr-1 inline h-3.5 w-3.5" /> Lista
      </button>
      <button type="button" className={`c-pill tap-44 ${view === "grelha" ? "active" : ""}`} onClick={() => onView("grelha")}>
        <LayoutGrid className="mr-1 inline h-3.5 w-3.5" /> Grelha
      </button>
    </div>
  );
}

export function PersonCard({
  p, org, selected, onToggle, onEdit, onOrganize, onDelete, view,
}: {
  p: Pessoa;
  org: Organizer;
  selected: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onOrganize: () => void;
  onDelete: () => void;
  view: PeopleView;
}) {
  const etiquetas = org.tagsOf(p.id);
  return (
    <div className="c-personcard">
      <div
        role="checkbox" tabIndex={0} aria-checked={selected} aria-label={`Selecionar ${p.nome}`}
        className="c-check"
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onToggle(); } }}
      >
        <span>{selected && <Check className="h-3.5 w-3.5" />}</span>
      </div>

      <div className="min-w-0 flex-1">
        <Link
          to="/pessoas/$id" params={{ id: p.id }}
          className={`flex min-w-0 items-start gap-3 ${view === "grelha" ? "flex-col" : ""}`}
          aria-label={`Abrir ficha de ${p.nome}`}
        >
          <div className="c-pavatar">{initialOf(p.nome)}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold" style={{ color: "var(--ink)" }}>{p.nome}</div>
            <div className="c-mono mt-0.5 truncate text-xs" style={{ color: "var(--muted)" }}>
              {[p.telefone, p.email].filter(Boolean).join(" · ") || "sem contacto"}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="c-badge">{p.relacao}</span>
              {etiquetas.map((t) => <span key={t.id} className="c-badge">{t.name}</span>)}
              {org.foldersOf(p.id).map((f) => (
                <span key={f.id} className="c-badge" style={f.color ? { background: `color-mix(in srgb, ${f.color} 14%, #fff)`, color: f.color, borderColor: "transparent" } : undefined}>
                  {f.name}
                </span>
              ))}
            </div>
          </div>
          {view === "lista" && <ChevronRight className="ml-auto h-5 w-5 self-center shrink-0" style={{ color: "var(--line)" }} />}
        </Link>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" className="c-badge tap-44" onClick={onEdit}><Pencil className="h-3 w-3" /> Editar</button>
          <button type="button" className="c-badge tap-44" onClick={onOrganize}><Tags className="h-3 w-3" /> Organizar</button>
          <button type="button" className="c-badge tap-44" onClick={onDelete}><Trash2 className="h-3 w-3" /> Eliminar</button>
          {view === "grelha" && (
            <Link to="/pessoas/$id" params={{ id: p.id }} className="c-badge tap-44">Abrir <ChevronRight className="h-3 w-3" /></Link>
          )}
        </div>
      </div>
    </div>
  );
}
