// Grelha mensal do calendário — visual do Afonso, comportamento Outlook/Google.
// Só apresentação: recebe os eventos já filtrados e devolve o dia escolhido.
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function dayKey(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function monthLabel(d: Date): string {
  const s = d.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function MonthGrid({
  month,
  selectedKey,
  markedKeys,
  counts,
  onSelect,
  onQuickAdd,
}: {
  month: Date;
  selectedKey: string;
  markedKeys: Set<string>;
  /** Nº de compromissos por dia — mostra contagem em vez do ponto. */
  counts?: Map<string, number>;
  onSelect: (key: string) => void;
  /** Criação rápida a partir do dia (mesmo fluxo do "registar"). */
  onQuickAdd?: (key: string) => void;
}) {
  const todayKey = dayKey(new Date());

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return { date: d, key: dayKey(d), outside: d.getMonth() !== month.getMonth() };
    });
  }, [month]);

  return (
    <div className="select-none">
      <div className="grid grid-cols-7 border-b border-border pb-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-border/60 pt-px">
        {cells.map((c) => {
          const isToday = c.key === todayKey;
          const isSelected = c.key === selectedKey;
          return (
            <div key={c.key} className="group relative min-w-0">
              <button
                type="button"
                onClick={() => onSelect(c.key)}
                onDoubleClick={() => onQuickAdd?.(c.key)}
                aria-current={isToday ? "date" : undefined}
                aria-pressed={isSelected}
                className={cn(
                  "flex h-14 w-full min-w-0 flex-col items-center justify-start gap-1 bg-card p-1 text-sm transition-colors hover:bg-accent sm:h-20 sm:p-1.5",
                  c.outside && "text-muted-foreground/50",
                  isSelected && "bg-accent",
                )}
              >
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-[15px] sm:h-7 sm:w-7 sm:text-sm",
                  isToday && "bg-primary font-semibold text-primary-foreground",
                  !isToday && isSelected && "font-semibold text-foreground ring-1 ring-primary/50",
                )}
              >
                {c.date.getDate()}
              </span>
              {markedKeys.has(c.key) &&
                (counts?.get(c.key) ? (
                  <span
                    aria-label={`${counts.get(c.key)} compromissos`}
                    className={cn(
                      "rounded-full bg-primary/12 px-1.5 text-[10px] font-medium leading-4 text-primary",
                      c.outside && "opacity-50",
                    )}
                  >
                    {counts.get(c.key)}
                  </span>
                ) : (
                  <span
                    aria-label="Tem compromissos"
                    className={cn(
                      "h-2 w-2 rounded-full bg-primary sm:h-1.5 sm:w-1.5",
                      c.outside && "opacity-50",
                    )}
                  />
                ))}
              </button>
              {onQuickAdd && (
                <button
                  type="button"
                  aria-label={`Novo compromisso em ${c.key}`}
                  onClick={() => onQuickAdd(c.key)}
                  className="absolute right-0.5 top-0.5 hidden h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary focus-visible:flex group-hover:flex sm:h-5 sm:w-5"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
