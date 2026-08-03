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

  const grelha = view === "grelha";
  const acoes = (
    <div className={`mt-2 flex flex-wrap items-center gap-1.5 ${grelha ? "" : "sm:gap-2"}`}>
      <button type="button" className="c-badge tap-44" onClick={onEdit} aria-label="Editar">
        <Pencil className="h-3 w-3 shrink-0" /> <span className={grelha ? "sr-only sm:not-sr-only" : "hidden xs:inline"}>Editar</span>
      </button>
      <button type="button" className="c-badge tap-44" onClick={onCategory} aria-label="Categoria">
        <Tag className="h-3 w-3 shrink-0" /> <span className={grelha ? "sr-only sm:not-sr-only" : "hidden xs:inline"}>Categoria</span>
      </button>
      <button type="button" className="c-badge tap-44" onClick={onOrganize} aria-label="Organizar">
        <Tags className="h-3 w-3 shrink-0" /> <span className={grelha ? "sr-only sm:not-sr-only" : "hidden xs:inline"}>Organizar</span>
      </button>
      <button type="button" className="c-badge tap-44" onClick={onDelete} aria-label="Eliminar">
        <Trash2 className="h-3 w-3 shrink-0" /> <span className={grelha ? "sr-only sm:not-sr-only" : "hidden xs:inline"}>Eliminar</span>
      </button>
      <Link to="/imoveis/$id" params={{ id: i.id }} className="c-badge tap-44 ml-auto">
        Abrir <ChevronRight className="h-3 w-3 shrink-0" />
      </Link>
    </div>
  );

  return (
    <div className={`c-personcard min-w-0 overflow-hidden ${grelha ? "p-2.5 sm:p-3" : ""}`}>
      <div
        role="checkbox" tabIndex={0} aria-checked={selected} aria-label={`Selecionar ${i.title}`}
        className={`c-check ${grelha ? "!w-8" : ""}`}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onToggle(); } }}
      >
        <span>{selected && <Check className="h-3.5 w-3.5" />}</span>
      </div>

      <div className="min-w-0 flex-1">
        <Link
          to="/imoveis/$id" params={{ id: i.id }}
          className={`flex min-w-0 items-start gap-2 sm:gap-3 ${grelha ? "flex-col" : ""}`}
          aria-label={`Abrir ficha de ${i.title}`}
        >
          {!grelha && <div className="c-pavatar sage" aria-hidden="true"><Home className="h-5 w-5" /></div>}
          <div className="w-full min-w-0 flex-1">
            <div className={`flex min-w-0 gap-2 ${grelha ? "flex-col items-start" : "items-start justify-between"}`}>
              <div className="w-full min-w-0">
                <div className={`text-[14.5px] font-semibold sm:text-[15px] ${grelha ? "line-clamp-2 break-words" : "truncate"}`} style={{ color: "var(--ink)" }}>{i.title}</div>
                <div className="c-mono mt-0.5 truncate text-xs" style={{ color: "var(--muted)" }}>
                  {[tipo, i.address || localizacao].filter(Boolean).join(" · ") || "Sem detalhes"}
                </div>
              </div>
              <span className={`c-badge max-w-full shrink-0 truncate ${angariado ? "ok" : "warn"}`}>{propertyStatusLabel(i.status)}</span>
            </div>
            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
              {i.asking_price != null && (
                <span className="c-badge c-mono">{formatEUR(Number(i.asking_price))}</span>
              )}
              <CategoryBadge category={category} />
              {origem && <span className="c-badge max-w-full truncate">via {origem}</span>}
              {i.file_count > 0 && <span className="c-badge c-mono"><FileText className="h-3 w-3" /> {i.file_count}</span>}
              {org.foldersOf(i.id).map((f) => (
                <span
                  key={f.id} className="c-badge max-w-full truncate"
                  style={f.color ? { background: `color-mix(in srgb, ${f.color} 14%, #fff)`, color: f.color, borderColor: "transparent" } : undefined}
                >
                  {f.name}
                </span>
              ))}
            </div>
          </div>
          {!grelha && <ChevronRight className="hidden h-5 w-5 shrink-0 self-center sm:block" style={{ color: "var(--line)" }} />}
        </Link>

        {acoes}
      </div>
    </div>
  );
}
