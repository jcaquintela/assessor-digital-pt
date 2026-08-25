// Grelha de horas da Agenda (vista Semana / Dia), estilo Google Calendar.
// Só leitura + abrir edição: sem arrastar. O layout vem de src/lib/agenda/time-grid.ts.
import { useMemo, useRef } from "react";
import {
  blockGeometry,
  HOUR_HEIGHT,
  hourRange,
  placeDay,
  slotTimeFromOffset,
  untimed,
} from "@/lib/agenda/time-grid";
import type { AgendaEvent } from "@/lib/agenda/views";
import { cn } from "@/lib/utils";

export interface TimeGridProps {
  /** Dias a mostrar em colunas ("YYYY-MM-DD"). Um só dia = vista de dia. */
  dayKeys: string[];
  eventsByDay: Map<string, AgendaEvent[]>;
  todayKey: string;
  selectedKey?: string;
  onSelectDay?: (key: string) => void;
  onEventClick?: (id: string) => void;
  onSlotClick?: (key: string, hhmm: string) => void;
}

function dayHeader(key: string): string {
  return new Date(`${key}T12:00:00`).toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "numeric",
  });
}

function isInterno(e: AgendaEvent): boolean {
  return (e.eventClass ?? "").toLowerCase() === "interno";
}

export function TimeGrid({
  dayKeys,
  eventsByDay,
  todayKey,
  selectedKey,
  onSelectDay,
  onEventClick,
  onSlotClick,
}: TimeGridProps) {
  const all = useMemo(
    () => dayKeys.flatMap((k) => eventsByDay.get(k) ?? []),
    [dayKeys, eventsByDay],
  );
  const { from, to } = useMemo(() => hourRange(all), [all]);
  const hours = useMemo(() => Array.from({ length: to - from }, (_, i) => from + i), [from, to]);
  const bodyHeight = hours.length * HOUR_HEIGHT;
  // Largura mínima por dia: com 7 colunas estreitas os títulos ficavam ilegíveis,
  // por isso a grelha ganha scroll horizontal em vez de encolher.
  const colMin = dayKeys.length > 1 ? "8.5rem" : "0px";
  const colsRef = useRef<HTMLDivElement | null>(null);

  const semHora = dayKeys.flatMap((k) =>
    untimed(eventsByDay.get(k) ?? []).map((e) => ({ key: k, e })),
  );

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div className="min-w-full">
          {/* Cabeçalho de dias */}
          <div
            className="grid border-b border-border"
            style={{
              gridTemplateColumns: `3.25rem repeat(${dayKeys.length}, minmax(${colMin},1fr))`,
            }}
          >
            <div />
            {dayKeys.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onSelectDay?.(k)}
                className={cn(
                  "px-1 py-1.5 text-center text-[12px] font-semibold capitalize",
                  k === todayKey ? "text-primary" : "text-muted-foreground",
                  k === selectedKey && "bg-accent/40",
                )}
              >
                {dayHeader(k)}
              </button>
            ))}
          </div>

          {/* Corpo: eixo de horas + colunas */}
          <div
            className="grid"
            style={{
              gridTemplateColumns: `3.25rem repeat(${dayKeys.length}, minmax(${colMin},1fr))`,
            }}
          >
            <div className="relative" style={{ height: bodyHeight }}>
              {hours.map((h, i) => (
                <div
                  key={h}
                  className="c-mono absolute right-1.5 -translate-y-1/2 text-[10.5px] text-muted-foreground"
                  style={{ top: i * HOUR_HEIGHT }}
                >
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            <div
              ref={colsRef}
              className="col-span-full col-start-2 grid"
              style={{
                gridTemplateColumns: `repeat(${dayKeys.length}, minmax(${colMin},1fr))`,
                height: bodyHeight,
              }}
            >
              {dayKeys.map((k) => {
                const placed = placeDay(eventsByDay.get(k) ?? []);
                return (
                  <div
                    key={k}
                    className={cn(
                      "relative border-l border-border",
                      k === todayKey && "bg-primary/[0.04]",
                    )}
                    onClick={(ev) => {
                      if (!onSlotClick) return;
                      if ((ev.target as HTMLElement).closest("[data-event-block]")) return;
                      const rect = ev.currentTarget.getBoundingClientRect();
                      onSlotClick(k, slotTimeFromOffset(ev.clientY - rect.top, from));
                    }}
                  >
                    {hours.map((h, i) => (
                      <div
                        key={h}
                        className="absolute inset-x-0 border-t border-border/60"
                        style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                      >
                        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border/35" />
                      </div>
                    ))}
                    {placed.map((p) => {
                      const { top, height } = blockGeometry(p, from);
                      const width = 100 / p.columns;
                      const interno = isInterno(p.event);
                      return (
                        <button
                          key={p.event.id}
                          type="button"
                          data-event-block
                          title={`${p.event.time ?? ""} ${p.event.title}`}
                          onClick={() => onEventClick?.(p.event.id)}
                          className={cn(
                            "absolute overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight",
                            interno
                              ? "border-l-2 border-border border-l-muted-foreground/50 bg-card text-foreground"
                              : "border-primary/40 bg-primary/15 text-foreground",
                          )}
                          style={{
                            top,
                            height,
                            left: `calc(${p.column * width}% + 2px)`,
                            width: `calc(${width}% - 4px)`,
                          }}
                        >
                          <span className="c-mono block text-[10px] opacity-80">
                            {p.event.time}
                          </span>
                          <span className="block truncate font-semibold">{p.event.title}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {semHora.length > 0 && (
        <div className="space-y-1.5 border-t border-border pt-3">
          <div className="c-section-title">Sem hora marcada</div>
          <div className="flex flex-wrap gap-1.5">
            {semHora.map(({ key, e }) => (
              <button
                key={e.id}
                type="button"
                className="c-badge tap-44"
                onClick={() => onEventClick?.(e.id)}
              >
                {dayHeader(key)} · {e.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
