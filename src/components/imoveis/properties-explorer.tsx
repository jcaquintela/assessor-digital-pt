import { Link } from "@tanstack/react-router";
import { Check, ChevronRight, FileText, Home, Pencil, Tag, Tags, Trash2 } from "lucide-react";
import type { Organizer } from "@/components/organizer/organizer";
import type { PeopleView } from "@/components/pessoas/people-explorer";
import { propertyStatusLabel } from "@/lib/assessor/properties-status";
import { formatEUR } from "@/lib/demo-data";
import { CategoryBadge } from "@/components/imoveis/property-categories";
import type { PropertyCategory } from "@/lib/imoveis/categories.functions";

export const ORIGEM: Record<string, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  web: "Dashboard",
  placa: "placa",
  prospecting: "placa",
};

export function PropertyCard({
  i, org, selected, onToggle, onEdit, onOrganize, onDelete, onCategory, category, view,
}: {
  i: any;
  org: Organizer;
  selected: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onOrganize: () => void;
  onDelete: () => void;
  onCategory: () => void;
  category: PropertyCategory | null;
  view: PeopleView;
}) {
  const localizacao = i.city || i.location || "";
  const tipo = i.typology || i.property_type || "";
  const origem = i.source_channel ? (ORIGEM[i.source_channel] ?? i.source_channel) : null;
  const angariado = i.status && i.status !== "em_angariacao" && i.status !== "por_angariar";

  return (
    <div className="c-personcard">
      <div
        role="checkbox" tabIndex={0} aria-checked={selected} aria-label={`Selecionar ${i.title}`}
        className="c-check"
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onToggle(); } }}
      >
        <span>{selected && <Check className="h-3.5 w-3.5" />}</span>
      </div>

      <div className="min-w-0 flex-1">
        <Link
          to="/imoveis/$id" params={{ id: i.id }}
          className={`flex min-w-0 items-start gap-3 ${view === "grelha" ? "flex-col" : ""}`}
          aria-label={`Abrir ficha de ${i.title}`}
        >
          <div className="c-pavatar sage" aria-hidden="true"><Home className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold" style={{ color: "var(--ink)" }}>{i.title}</div>
                <div className="c-mono mt-0.5 truncate text-xs" style={{ color: "var(--muted)" }}>
                  {[tipo, i.address || localizacao].filter(Boolean).join(" · ") || "Sem detalhes"}
                </div>
              </div>
              <span className={`c-badge shrink-0 ${angariado ? "ok" : "warn"}`}>{propertyStatusLabel(i.status)}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {i.asking_price != null && (
                <span className="c-badge c-mono">{formatEUR(Number(i.asking_price))}</span>
              )}
              <CategoryBadge category={category} />
              {origem && <span className="c-badge">via {origem}</span>}
              {i.file_count > 0 && <span className="c-badge c-mono"><FileText className="h-3 w-3" /> {i.file_count}</span>}
              {org.foldersOf(i.id).map((f) => (
                <span
                  key={f.id} className="c-badge"
                  style={f.color ? { background: `color-mix(in srgb, ${f.color} 14%, #fff)`, color: f.color, borderColor: "transparent" } : undefined}
                >
                  {f.name}
                </span>
              ))}
            </div>
          </div>
          {view === "lista" && <ChevronRight className="ml-auto h-5 w-5 shrink-0 self-center" style={{ color: "var(--line)" }} />}
        </Link>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" className="c-badge tap-44" onClick={onEdit}><Pencil className="h-3 w-3" /> Editar</button>
          <button type="button" className="c-badge tap-44" onClick={onCategory}><Tag className="h-3 w-3" /> Categoria</button>
          <button type="button" className="c-badge tap-44" onClick={onOrganize}><Tags className="h-3 w-3" /> Organizar</button>
          <button type="button" className="c-badge tap-44" onClick={onDelete}><Trash2 className="h-3 w-3" /> Eliminar</button>
          {view === "grelha" && (
            <Link to="/imoveis/$id" params={{ id: i.id }} className="c-badge tap-44">Abrir <ChevronRight className="h-3 w-3" /></Link>
          )}
        </div>
      </div>
    </div>
  );
}
