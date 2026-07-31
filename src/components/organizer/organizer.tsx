import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Tag, Folder, X } from "lucide-react";
import {
  listOrganizer, createTag, deleteTag, createFolder, deleteFolder,
  toggleTagOnEntity, toggleFolderItem, type OrganizerEntity,
} from "@/lib/organizer/organizer.functions";

export function useOrganizer(entityType: OrganizerEntity) {
  const qc = useQueryClient();
  const fetchAll = useServerFn(listOrganizer);
  const q = useQuery({
    queryKey: ["organizer", entityType],
    queryFn: () => fetchAll({ data: { entityType } }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["organizer", entityType] });
  const data = q.data ?? { tags: [], folders: [], tagLinks: [], folderLinks: [] };
  return {
    ...data,
    refresh,
    tagsOf: (id: string) =>
      data.tagLinks.filter((l) => l.entity_id === id).map((l) => data.tags.find((t) => t.id === l.tag_id)).filter(Boolean) as { id: string; name: string }[],
    foldersOf: (id: string) =>
      data.folderLinks.filter((l) => l.entity_id === id).map((l) => data.folders.find((f) => f.id === l.folder_id)).filter(Boolean) as { id: string; name: string }[],
  };
}

export type Organizer = ReturnType<typeof useOrganizer>;

/* ---------- Filtro lateral (etiquetas + grupos) ---------- */

export function OrganizerFilter({
  entityType,
  org,
  tagId,
  folderId,
  onTag,
  onFolder,
}: {
  entityType: OrganizerEntity;
  org: Organizer;
  tagId: string | null;
  folderId: string | null;
  onTag: (id: string | null) => void;
  onFolder: (id: string | null) => void;
}) {
  const addTag = useServerFn(createTag);
  const delTag = useServerFn(deleteTag);
  const addFolder = useServerFn(createFolder);
  const delFolder = useServerFn(deleteFolder);
  const [novaTag, setNovaTag] = useState("");
  const [novoGrupo, setNovoGrupo] = useState("");

  async function run(fn: () => Promise<unknown>, ok: string) {
    try { await fn(); org.refresh(); toast.success(ok); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="c-card p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--ink)" }}>
          <Tag className="h-3.5 w-3.5" /> Etiquetas
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={`c-badge ${tagId === null ? "ok" : ""}`} onClick={() => onTag(null)}>Todas</button>
          {org.tags.map((t) => (
            <span key={t.id} className="inline-flex items-center">
              <button type="button" className={`c-badge ${tagId === t.id ? "ok" : ""}`} onClick={() => onTag(tagId === t.id ? null : t.id)}>
                {t.name}
              </button>
              <button
                type="button" aria-label={`Apagar etiqueta ${t.name}`} className="ml-0.5 opacity-50 hover:opacity-100"
                onClick={() => { if (confirm(`Apagar a etiqueta "${t.name}"?`)) void run(() => delTag({ data: { id: t.id } }), "Etiqueta apagada."); }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          <Input value={novaTag} onChange={(e) => setNovaTag(e.target.value)} placeholder="Nova etiqueta" className="h-8 text-xs" />
          <Button size="sm" variant="secondary" disabled={!novaTag.trim()}
            onClick={() => run(async () => { await addTag({ data: { name: novaTag } }); setNovaTag(""); }, "Etiqueta criada.")}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="c-card p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--ink)" }}>
          <Folder className="h-3.5 w-3.5" /> Grupos
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={`c-badge ${folderId === null ? "ok" : ""}`} onClick={() => onFolder(null)}>Todos</button>
          {org.folders.map((f) => (
            <span key={f.id} className="inline-flex items-center">
              <button type="button" className={`c-badge ${folderId === f.id ? "ok" : ""}`} onClick={() => onFolder(folderId === f.id ? null : f.id)}>
                {f.name}
              </button>
              <button
                type="button" aria-label={`Apagar grupo ${f.name}`} className="ml-0.5 opacity-50 hover:opacity-100"
                onClick={() => { if (confirm(`Apagar o grupo "${f.name}"?`)) void run(() => delFolder({ data: { id: f.id } }), "Grupo apagado."); }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          <Input value={novoGrupo} onChange={(e) => setNovoGrupo(e.target.value)} placeholder="Novo grupo" className="h-8 text-xs" />
          <Button size="sm" variant="secondary" disabled={!novoGrupo.trim()}
            onClick={() => run(async () => { await addFolder({ data: { name: novoGrupo } }); setNovoGrupo(""); }, "Grupo criado.")}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <input type="hidden" value={entityType} readOnly />
    </div>
  );
}

/* ---------- Atribuir etiquetas/grupos a um registo ---------- */

export function OrganizeDialog({
  entityType,
  entityId,
  title,
  org,
  open,
  onOpenChange,
}: {
  entityType: OrganizerEntity;
  entityId: string | null;
  title: string;
  org: Organizer;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const tTag = useServerFn(toggleTagOnEntity);
  const tFolder = useServerFn(toggleFolderItem);
  if (!entityId) return null;
  const tagIds = new Set(org.tagsOf(entityId).map((t) => t.id));
  const folderIds = new Set(org.foldersOf(entityId).map((f) => f.id));

  async function run(fn: () => Promise<unknown>) {
    try { await fn(); org.refresh(); } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Organizar — {title}</DialogTitle>
          <DialogDescription>Escolhe etiquetas e grupos. Cria novos na página.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-xs font-semibold">Etiquetas</div>
            {org.tags.length === 0 && <p className="text-xs text-muted-foreground">Ainda não criaste etiquetas.</p>}
            <div className="flex flex-wrap gap-1.5">
              {org.tags.map((t) => (
                <button key={t.id} type="button" className={`c-badge ${tagIds.has(t.id) ? "ok" : ""}`}
                  onClick={() => run(() => tTag({ data: { tagId: t.id, entityType, entityId: entityId!, on: !tagIds.has(t.id) } }))}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold">Grupos</div>
            {org.folders.length === 0 && <p className="text-xs text-muted-foreground">Ainda não criaste grupos.</p>}
            <div className="flex flex-wrap gap-1.5">
              {org.folders.map((f) => (
                <button key={f.id} type="button" className={`c-badge ${folderIds.has(f.id) ? "ok" : ""}`}
                  onClick={() => run(() => tFolder({ data: { folderId: f.id, entityType, entityId: entityId!, on: !folderIds.has(f.id) } }))}>
                  {f.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}