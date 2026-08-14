// Cartão de compromisso partilhado pelas 4 vistas da Agenda (Hoje, Semana,
// Mês, Lista). Só apresentação — a fonte de dados é sempre a mesma.
import { Link } from "@tanstack/react-router";
import { Archive, Calendar as CalendarIcon, Pencil, Users } from "lucide-react";
import { formatData } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

export interface AgendaCardEvent {
  id: string;
  titulo: string;
  data: string;
  hora?: string;
  classeEvento?: string;
}

export function isInterno(e: { classeEvento?: string }): boolean {
  return (e.classeEvento ?? "").toLowerCase() === "interno";
}

export function EventCard({
  e,
  compact = false,
  onEdit,
  onArchive,
}: {
  e: AgendaCardEvent;
  compact?: boolean;
  onEdit?: (e: AgendaCardEvent) => void;
  onArchive?: (id: string, titulo: string) => void;
}) {
  const interno = isInterno(e);
  return (
    <div
      className={cn(
        "c-card c-card-hover",
        compact ? "p-2.5" : "p-3.5",
        interno && "border-l-2 border-l-muted-foreground/40",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <Link to="/seguimentos/$id" params={{ id: e.id }} className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold">{e.titulo}</div>
          <div className="c-muted c-mono mt-1 text-[11.5px]">
            {formatData(e.data)}
            {e.hora ? ` · ${e.hora.slice(0, 5)}` : ""}
          </div>
        </Link>
        <span className="c-badge shrink-0">
          {interno ? <Users className="h-3 w-3" /> : <CalendarIcon className="h-3 w-3" />}
          {e.hora ? e.hora.slice(0, 5) : "—"}
        </span>
      </div>
      {(onEdit || onArchive) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {onEdit && (
            <button type="button" className="c-badge tap-44" onClick={() => onEdit(e)}>
              <Pencil className="h-3 w-3" /> Editar
            </button>
          )}
          {onArchive && (
            <button
              type="button"
              className="c-badge tap-44 text-destructive"
              onClick={() => onArchive(e.id, e.titulo)}
            >
              <Archive className="h-3 w-3" /> Arquivar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
