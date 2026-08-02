import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import {
  listPropertyCategories,
  createPropertyCategory,
  renamePropertyCategory,
  deletePropertyCategory,
  setPropertyCategory,
  type PropertyCategory,
} from "@/lib/imoveis/categories.functions";

// Mesma paleta das categorias do Drive.
const CATEGORY_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e",
  "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6",
  "#d946ef", "#f43f5e", "#78716c", "#64748b",
];

export function ColorDot({ color, size = "sm" }: { color: string | null; size?: "sm" | "md" }) {
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

export function usePropertyCategories() {
  const qc = useQueryClient();
  const fetchAll = useServerFn(listPropertyCategories);
  const q = useQuery({ queryKey: ["properties", "categories"], queryFn: () => fetchAll() });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["properties"] });
  };
  const categories = (q.data ?? []) as PropertyCategory[];
  const byId = (id: string | null | undefined) => categories.find((c) => c.id === id) ?? null;
  return { categories, byId, invalidate, isLoading: q.isLoading };
}

export function CategoryBadge({ category }: { category: PropertyCategory | null }) {
  if (!category) return null;
  return (
    <span
      className="c-badge"
      style={category.color
        ? { background: `color-mix(in srgb, ${category.color} 14%, #fff)`, color: category.color, borderColor: "transparent" }
        : undefined}
    >
      <ColorDot color={category.color} /> {category.name}
    </span>
  );
}

// Filtro por categoria + gestão (criar, renomear, apagar) — igual ao Drive.
export function PropertyCategoryFilter({
  selected,
  hideHeading = false,
  usage,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string | null) => void;
  hideHeading?: boolean;
  /** Nº de imóveis por categoria — usado para pôr as mais usadas à frente. */
  usage?: Record<string, number>;
}) {
  const { categories: todas, invalidate } = usePropertyCategories();
  const categories = useMemo<PropertyCategory[]>(() => {
    const n = (id: string) => usage?.[id] ?? 0;
    return [...todas].sort((a: PropertyCategory, b: PropertyCategory) =>
      n(b.id) - n(a.id) || a.name.localeCompare(b.name, "pt"));
  }, [todas, usage]);
  const create = useServerFn(createPropertyCategory);
  const rename = useServerFn(renamePropertyCategory);
  const remove = useServerFn(deletePropertyCategory);
  const [aCriar, setACriar] = useState(false);
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
      setNome(""); setNovaCor(null); setACriar(false);
      invalidate();
      toast.success("Categoria criada.");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível criar.");
    } finally { setBusy(false); }
  }

  async function guardar(id: string) {
    if (!editNome.trim()) return;
    setBusy(true);
    try {
      await rename({ data: { id, name: editNome.trim(), color: editCor } });
      setEditId(null);
      invalidate();
      toast.success("Categoria atualizada.");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível atualizar.");
    } finally { setBusy(false); }
  }

  async function apagar(c: PropertyCategory) {
    if (!confirm(`Apagar a categoria "${c.name}"? Os imóveis mantêm-se, ficam sem categoria.`)) return;
    setBusy(true);
    try {
      await remove({ data: { id: c.id } });
      if (selected === c.id) onSelect(null);
      invalidate();
      toast.success("Categoria apagada.");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível apagar.");
    } finally { setBusy(false); }
  }

  return (
    <div>
      {!hideHeading && (
        <div className="c-muted mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
          <Tag className="h-3.5 w-3.5" /> Categoria
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={"c-pill tap-44" + (selected === null ? " active" : "")} onClick={() => onSelect(null)}>
          Todas
        </button>
        {categories.map((c) =>
          editId === c.id ? (
            <span key={c.id} className="flex flex-wrap items-center gap-1">
              <Input
                value={editNome} autoFocus
                onChange={(e) => setEditNome(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") guardar(c.id); if (e.key === "Escape") setEditId(null); }}
                className="h-9 w-40"
              />
              <ColorPicker value={editCor} onChange={setEditCor} />
              <button type="button" aria-label="Guardar" className="c-badge tap-44" onClick={() => guardar(c.id)}>
                <Check className="h-3 w-3" />
              </button>
              <button type="button" aria-label="Cancelar" className="c-badge tap-44" onClick={() => setEditId(null)}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ) : (
            <span key={c.id} className="flex items-center gap-1">
              <button
                type="button"
                className={"c-pill tap-44 flex items-center gap-1.5" + (selected === c.id ? " active" : "")}
                onClick={() => onSelect(selected === c.id ? null : c.id)}
              >
                <ColorDot color={c.color} />
                {c.name}
                {usage?.[c.id] ? <span className="opacity-60">{usage[c.id]}</span> : null}
              </button>
              <button
                type="button" aria-label={`Editar ${c.name}`} className="c-badge tap-44"
                onClick={() => { setEditId(c.id); setEditNome(c.name); setEditCor(c.color); }}
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button type="button" aria-label={`Apagar categoria ${c.name}`} className="c-badge tap-44" onClick={() => apagar(c)}>
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ),
        )}
        <button type="button" className="c-pill tap-44" aria-label="Nova categoria" onClick={() => setACriar((v) => !v)}>
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      {aCriar && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") criar(); }}
            placeholder="Nova categoria (ex: Angariação própria)"
            className="h-9 max-w-xs"
          />
          <ColorPicker value={novaCor} onChange={setNovaCor} />
          <Button type="button" size="sm" variant="secondary" onClick={criar} disabled={busy || !nome.trim()}>
            Criar
          </Button>
        </div>
      )}
    </div>
  );
}

// Escolher a categoria de um imóvel.
export function PropertyCategoryDialog({
  propertyId,
  propertyTitle,
  currentId,
  open,
  onOpenChange,
}: {
  propertyId: string | null;
  propertyTitle?: string | null;
  currentId?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { categories, invalidate } = usePropertyCategories();
  const save = useServerFn(setPropertyCategory);
  const create = useServerFn(createPropertyCategory);
  const [busy, setBusy] = useState(false);
  const [nova, setNova] = useState("");
  const [novaCor, setNovaCor] = useState<string | null>(null);

  useEffect(() => { if (open) { setNova(""); setNovaCor(null); } }, [open, propertyId]);

  async function escolher(categoryId: string | null) {
    if (!propertyId) return;
    setBusy(true);
    try {
      await save({ data: { propertyId, categoryId } });
      invalidate();
      toast.success(categoryId ? "Categoria atualizada." : "Imóvel ficou sem categoria.");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível guardar.");
    } finally { setBusy(false); }
  }

  async function criarEatribuir() {
    if (!nova.trim() || !propertyId) return;
    setBusy(true);
    try {
      const cat = await create({ data: { name: nova.trim(), color: novaCor } });
      await save({ data: { propertyId, categoryId: cat.id } });
      invalidate();
      toast.success("Categoria criada e atribuída.");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível criar.");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Categoria do imóvel</DialogTitle>
          <DialogDescription>
            {propertyTitle ? `${propertyTitle}. ` : ""}
            As categorias são tuas — podes renomear ou apagar quando quiseres.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <button
            type="button"
            className={"c-category-box" + (!currentId ? " active" : "")}
            onClick={() => escolher(null)}
            disabled={busy}
          >
            <span className="truncate text-left">Sem categoria</span>
            <span className="c-category-check flex-shrink-0">{!currentId ? <Check className="h-3 w-3" /> : null}</span>
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
              <span className="c-category-check flex-shrink-0">{currentId === c.id ? <Check className="h-3 w-3" /> : null}</span>
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
            <Button type="button" size="sm" onClick={criarEatribuir} disabled={busy || !nova.trim()}>Criar</Button>
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