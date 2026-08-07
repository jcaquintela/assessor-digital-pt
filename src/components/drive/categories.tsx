import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAssessorName } from "@/lib/assessor/assessor-name";
import { Check, Pencil, Plus, Tag, Trash2, X } from "lucide-react";

const CATEGORY_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e",
  "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6",
  "#d946ef", "#f43f5e", "#78716c", "#64748b",
];

function CategoryCheck({ active }: { active: boolean }) {
  return (
    <span className="c-category-check flex-shrink-0">
      {active ? <Check className="h-3 w-3" /> : null}
    </span>
  );
}

function ColorDot({ color, size = "sm" }: { color: string | null; size?: "sm" | "md" }) {
  if (!color) return null;
  const s = size === "md" ? "h-4 w-4" : "h-2.5 w-2.5";
  return (
    <span
      className={`${s} rounded-full ring-1 ring-black/10 dark:ring-white/20`}
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}

function ColorPicker({ value, onChange }: { value: string | null; onChange: (c: string | null) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {CATEGORY_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(value === c ? null : c)}
          className={`h-7 w-7 rounded-full ring-2 transition ${value === c ? "ring-foreground scale-110" : "ring-transparent hover:ring-muted"}`}
          style={{ backgroundColor: c }}
          aria-label={`Cor ${c}`}
          aria-pressed={value === c}
        />
      ))}
      {value && (
        <button type="button" onClick={() => onChange(null)} className="c-badge text-[10px]">
          <X className="h-3 w-3" /> Sem cor
        </button>
      )}
    </div>
  );
}

import {
  listFileCategories,
  createFileCategory,
  renameFileCategory,
  deleteFileCategory,
  setFileCategory,
} from "@/lib/drive/drive.functions";

export type FileCategory = { id: string; name: string; color: string | null };

// Categorias criadas pelo próprio consultor. A classificação automática do
// Assessor continua a existir — a categoria manual é só uma camada por cima.
export function useFileCategories() {
  const qc = useQueryClient();
  const fetchAll = useServerFn(listFileCategories);
  const q = useQuery({ queryKey: ["drive", "categories"], queryFn: () => fetchAll() });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["drive", "categories"] });
    qc.invalidateQueries({ queryKey: ["drive", "list"] });
  };
  return { categories: (q.data ?? []) as FileCategory[], invalidate, isLoading: q.isLoading };
}

export function CategoriesBar({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { categories, invalidate } = useFileCategories();
  const { name: assessorName } = useAssessorName();
  const create = useServerFn(createFileCategory);
  const rename = useServerFn(renameFileCategory);
  const remove = useServerFn(deleteFileCategory);
  const [nome, setNome] = useState("");
  const [novaCor, setNovaCor] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editCor, setEditCor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function criar() {
    if (!nome.trim() || busy) return;
    setBusy(true);
    try {
      await create({ data: { name: nome.trim(), color: novaCor } });
      setNome("");
      setNovaCor(null);
      invalidate();
      toast.success("Categoria criada.");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível criar.");
    } finally {
      setBusy(false);
    }
  }

  async function guardarEdicao(id: string) {
    if (!editNome.trim()) return;
    setBusy(true);
    try {
      await rename({ data: { id, name: editNome.trim(), color: editCor } });
      setEditId(null);
      invalidate();
      toast.success("Categoria atualizada.");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível atualizar.");
    } finally {
      setBusy(false);
    }
  }

  async function apagar(c: FileCategory) {
    if (!confirm(`Apagar a categoria "${c.name}"? Os ficheiros mantêm-se, voltam à classificação automática.`)) return;
    setBusy(true);
    try {
      await remove({ data: { id: c.id } });
      if (selected === c.id) onSelect(null);
      invalidate();
      toast.success("Categoria apagada.");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível apagar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="c-card mb-4 p-3">
      <div className="c-muted mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide">
        <Tag className="h-3.5 w-3.5" /> As minhas categorias
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className={"c-pill" + (selected === null ? " active" : "")}
          onClick={() => onSelect(null)}
        >
          Todas
        </button>
        {categories.map((c) =>
          editId === c.id ? (
            <span key={c.id} className="flex items-center gap-1">
              <Input
                value={editNome}
                autoFocus
                onChange={(e) => setEditNome(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") guardarEdicao(c.id);
                  if (e.key === "Escape") setEditId(null);
                }}
                className="h-8 w-40"
              />
              <button type="button" aria-label="Guardar" className="c-badge" onClick={() => guardarEdicao(c.id)}>
                <Check className="h-3 w-3" />
              </button>
              <button type="button" aria-label="Cancelar" className="c-badge" onClick={() => setEditId(null)}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ) : (
            <span key={c.id} className="flex items-center gap-1">
              <button
                type="button"
                className={"c-pill flex items-center gap-1.5" + (selected === c.id ? " active" : "")}
                onClick={() => onSelect(selected === c.id ? null : c.id)}
              >
                <ColorDot color={c.color} />
                {c.name}
              </button>
              <button
                type="button"
                aria-label={`Editar ${c.name}`}
                className="c-badge"
                onClick={() => { setEditId(c.id); setEditNome(c.name); setEditCor(c.color); }}
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                aria-label={`Apagar categoria ${c.name}`}
                className="c-badge"
                onClick={() => apagar(c)}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ),
        )}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") criar(); }}
          placeholder="Nova categoria (ex: Contratos assinados)"
          className="h-9 max-w-xs"
        />
        <ColorPicker value={novaCor} onChange={setNovaCor} />
        <Button type="button" size="sm" variant="secondary" aria-label="Criar categoria" onClick={criar} disabled={busy}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Reclassificação manual de um ficheiro.
export function FileCategoryDialog({
  fileId,
  fileName,
  autoLabel,
  currentId,
  open,
  onOpenChange,
}: {
  fileId: string | null;
  fileName?: string | null;
  autoLabel?: string | null;
  currentId?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { categories, invalidate } = useFileCategories();
  const save = useServerFn(setFileCategory);
  const create = useServerFn(createFileCategory);
  const [busy, setBusy] = useState(false);
  const [nova, setNova] = useState("");
  const [novaCor, setNovaCor] = useState<string | null>(null);

  useEffect(() => { if (open) { setNova(""); setNovaCor(null); } }, [open, fileId]);

  async function escolher(categoryId: string | null) {
    if (!fileId) return;
    setBusy(true);
    try {
      await save({ data: { fileId, categoryId } });
      invalidate();
      toast.success(categoryId ? "Ficheiro reclassificado." : "Voltou à classificação automática.");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível reclassificar.");
    } finally {
      setBusy(false);
    }
  }

  async function criarEatribuir() {
    if (!nova.trim() || !fileId) return;
    setBusy(true);
    try {
      const cat = await create({ data: { name: nova.trim(), color: novaCor } });
      await save({ data: { fileId, categoryId: cat.id } });
      invalidate();
      toast.success("Categoria criada e atribuída.");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível criar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Categoria do ficheiro</DialogTitle>
          <DialogDescription>
            {fileName ? `${fileName}. ` : ""}
            {autoLabel ? `O Assessor sugeriu "${autoLabel}". ` : ""}
            Escolhe uma categoria tua — a sugestão automática mantém-se guardada.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <button
            type="button"
            className={"c-category-box" + (!currentId ? " active" : "")}
            onClick={() => escolher(null)}
            disabled={busy}
          >
            <span className="text-left">
              <span className="block text-[11px] font-semibold uppercase tracking-wide opacity-70">Automática</span>
              <span className="block truncate">{autoLabel ? autoLabel : `Sugestão do ${assessorName}`}</span>
            </span>
            <CategoryCheck active={!currentId} />
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={"c-category-box" + (currentId === c.id ? " active" : "")}
              onClick={() => escolher(c.id)}
              disabled={busy}
            >
              <span className="flex items-center gap-2 truncate">
                <ColorDot color={c.color} size="md" />
                <span className="truncate">{c.name}</span>
              </span>
              <CategoryCheck active={currentId === c.id} />
            </button>
          ))}
        </div>

        <div className="mt-2 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Input
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") criarEatribuir(); }}
              placeholder="Criar nova categoria…"
              className="h-9"
            />
            <Button type="button" size="sm" onClick={criarEatribuir} disabled={busy || !nova.trim()}>
              Criar
            </Button>
          </div>
          <ColorPicker value={novaCor} onChange={setNovaCor} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
