import { Link2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import type { GroupCard } from "@/lib/ui/group-cards";
import { groupShareUrl } from "@/lib/ui/group-cards";

/**
 * Grelha de cartões de grupo — o mesmo padrão de navegação já usado no Drive,
 * agora partilhado por Imóveis, Negócios e Faturação.
 */
export function GroupCardsRow<T>({
  cards,
  openKey,
  onOpen,
  pathname,
  hierarchy = false,
}: {
  cards: GroupCard<T>[];
  openKey: string | null;
  onOpen: (key: string) => void;
  /** Caminho desta página, para o link partilhável. */
  pathname: string;
  /** Hierarquia "instrumento": contagem grande em cima, etiqueta cinza por baixo. */
  hierarchy?: boolean;
}) {
  if (!cards.length) return null;

  async function copiar(key: string) {
    const url = groupShareUrl(window.location.origin, pathname, key);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não consegui copiar o link.");
    }
  }

  return (
    <div className={`mb-4 grid min-w-0 grid-cols-[repeat(auto-fill,minmax(150px,1fr))] ${hierarchy ? "gap-3" : "gap-2"}`}>
      {cards.map((c) => {
        const aberto = openKey === c.key;
        return (
          <div
            key={c.key}
            className={`c-card ${hierarchy ? "c-groupcard p-4" : "p-3"} ${aberto ? "ring-1" : "c-card-hover"}`}
            style={aberto ? { borderColor: "var(--ink-soft)" } : undefined}
          >
            <button
              type="button"
              className="tap-44 flex w-full items-start justify-between gap-2 text-left"
              onClick={() => onOpen(c.key)}
              aria-expanded={aberto}
            >
              {hierarchy ? (
                <span className="min-w-0">
                  <span className="c-group-count block">{c.count}</span>
                  <span className="c-group-label block truncate font-medium">{c.label}</span>
                  <span className="mt-0.5 block text-[11px]" style={{ color: "var(--muted)", opacity: 0.65 }}>
                    {c.count === 0 ? "sem registos" : c.inline ? "abre aqui" : "vista dedicada"}
                  </span>
                </span>
              ) : (
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-semibold" style={{ color: "var(--ink)" }}>
                  {c.label}
                </span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {c.count === 0
                    ? "sem registos"
                    : `${c.count} ${c.count === 1 ? "registo" : "registos"}`}
                  {c.count > 0 && !c.inline ? " · vista dedicada" : ""}
                </span>
              </span>
              )}
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform ${aberto ? "rotate-180" : ""}`}
                style={{ color: "var(--muted)" }}
              />
            </button>
            <button
              type="button"
              className="tap-44 mt-1 inline-flex items-center gap-1 text-[11px] font-semibold"
              style={{ color: "var(--muted)" }}
              onClick={() => void copiar(c.key)}
            >
              <Link2 className="h-3 w-3" /> Copiar link
            </button>
          </div>
        );
      })}
    </div>
  );
}