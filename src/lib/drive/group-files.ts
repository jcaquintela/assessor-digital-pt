// Agrupamento da vista principal do Drive Inteligente.
// Função pura e testável: mantém contagem e ordenação estáveis nos dois agrupamentos.

export type GroupBy = "categoria" | "negocio" | "lista";

import { SYSTEM_CATEGORY_LABEL, SYSTEM_CATEGORY_ORDER } from "./system-category";

export type DriveFileLike = {
  id: string;
  custom_category_id?: string | null;
  /** Categoria automática atribuída pelo sistema (só usada sem categoria manual). */
  system_category?: string | null;
};

export type DriveLinkLike = {
  entity_type: string;
  entity_id: string;
  entity_name?: string | null;
};

export type DriveCategoryLike = { id: string; name: string };

export type DriveGroup<F> = {
  key: string;
  label: string;
  files: F[];
  destaque?: boolean;
};

export function groupDriveFiles<F extends DriveFileLike>(
  files: F[],
  linksByFile: Record<string, DriveLinkLike[] | undefined>,
  categories: DriveCategoryLike[],
  groupBy: GroupBy,
): DriveGroup<F>[] {
  if (groupBy === "lista") return [{ key: "todos", label: "", files }];

  if (groupBy === "categoria") {
    const known = new Set(categories.map((c) => c.id));
    const semCategoria: F[] = [];
    const porCat = new Map<string, F[]>();
    const porSistema = new Map<string, F[]>();
    for (const f of files) {
      const id = f.custom_category_id ?? null;
      if (!id || !known.has(id)) {
        const sys = f.system_category ?? null;
        if (sys) {
          const b = porSistema.get(sys);
          if (b) b.push(f);
          else porSistema.set(sys, [f]);
        } else {
          semCategoria.push(f);
        }
        continue;
      }
      const bucket = porCat.get(id);
      if (bucket) bucket.push(f);
      else porCat.set(id, [f]);
    }
    const out: DriveGroup<F>[] = [];
    if (semCategoria.length)
      out.push({ key: "cat:none", label: "Por categorizar", files: semCategoria, destaque: true });
    for (const c of categories) {
      const fs = porCat.get(c.id);
      if (fs?.length) out.push({ key: `cat:${c.id}`, label: c.name, files: fs });
    }
    for (const key of SYSTEM_CATEGORY_ORDER) {
      const fs = porSistema.get(key);
      if (fs?.length)
        out.push({ key: `sys:${key}`, label: SYSTEM_CATEGORY_LABEL[key], files: fs });
    }
    return out;
  }

  // Por negócio: usa as ligações já existentes a oportunidades/negócios.
  const semNegocio: F[] = [];
  const porNeg = new Map<string, { label: string; files: F[] }>();
  for (const f of files) {
    const links = (linksByFile[f.id] ?? []).filter((l) => l.entity_type === "opportunity");
    if (!links.length) {
      semNegocio.push(f);
      continue;
    }
    for (const l of links) {
      const prev = porNeg.get(l.entity_id);
      if (prev) prev.files.push(f);
      else porNeg.set(l.entity_id, { label: l.entity_name ?? "Negócio", files: [f] });
    }
  }
  const out: DriveGroup<F>[] = [...porNeg.entries()]
    .sort((a, b) => a[1].label.localeCompare(b[1].label, "pt-PT"))
    .map(([id, v]) => ({ key: `neg:${id}`, label: v.label, files: v.files }));
  if (semNegocio.length)
    out.push({ key: "neg:none", label: "Sem negócio associado", files: semNegocio, destaque: true });
  return out;
}
