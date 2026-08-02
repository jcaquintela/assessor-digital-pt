import { useState, type ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";

/**
 * Secção de filtros recolhível.
 * Fechada por defeito: a página abre leve e o consultor abre o que precisa.
 * Se houver filtro ativo, o resumo continua visível mesmo fechada.
 */
export function FilterSection({
  title,
  count,
  activeLabel,
  onClearActive,
  children,
}: {
  title: string;
  /** Nº de opções existentes (ex.: 2 etiquetas). */
  count: number;
  /** Nome do filtro ativo nesta secção, se houver. */
  activeLabel?: string | null;
  onClearActive?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const active = Boolean(activeLabel);

  return (
    <div
      className="rounded-xl border"
      style={{ borderColor: "var(--line)", background: "#fff" }}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="tap-44 flex min-w-0 items-center gap-2 px-3 py-2.5 text-left"
        >
          <span
            className="shrink-0 text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--muted)" }}
          >
            {title}
          </span>
          {active ? (
            <span className="c-badge min-w-0 truncate">{activeLabel}</span>
          ) : (
            <span className="truncate text-[12.5px]" style={{ color: "var(--muted)" }}>
              ({count} {count === 1 ? "ativa" : "ativas"})
            </span>
          )}
          <ChevronDown
            className={`ml-auto h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            style={{ color: "var(--muted)" }}
          />
        </button>
        {active && onClearActive && (
          <button
            type="button"
            aria-label={`Limpar filtro ${title}`}
            className="tap-44 mr-2 shrink-0 opacity-60 hover:opacity-100"
            onClick={onClearActive}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && <div className="border-t px-3 py-3" style={{ borderColor: "var(--line)" }}>{children}</div>}
    </div>
  );
}
