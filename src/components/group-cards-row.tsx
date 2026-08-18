import type { ReactNode } from "react";
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
  renderInline,
  keyAttr,
  shareParams,
}: {
  cards: GroupCard<T>[];
  openKey: string | null;
  onOpen: (key: string) => void;
  /** Caminho desta página, para o link partilhável. */
  pathname: string;
  /** Conteúdo expandido por baixo do cartão (só para cartões `inline`). */
  renderInline?: (card: GroupCard<T>) => ReactNode;
  /** Nome do atributo de dados por cartão (ex.: "data-categoria" no Drive). */
  keyAttr?: string;
  /** Parâmetros extra a manter no link partilhável (ex.: `tab` no Drive). */
  shareParams?: Record<string, string | undefined>;
}) {
  if (!cards.length) return null;

  async function copiar(key: string) {
    const url = groupShareUrl(window.location.origin, pathname, key, shareParams);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não consegui copiar o link.");
    }
  }

  return (
    <div className={`mb-4 grid min-w-0 grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3`}>
      {cards.map((c) => {
        const aberto = openKey === c.key;
        const expandeAqui = aberto && !!renderInline && c.inline;
        return (
          <div
            key={c.key}
            {...(keyAttr ? { [keyAttr]: c.key } : {})}
            className={`c-card c-groupcard p-4 ${aberto ? "ring-1" : "c-card-hover"} ${expandeAqui ? "col-span-full" : ""}`}
            style={aberto ? { borderColor: "var(--ink-soft)" } : undefined}
          >
            <button
              type="button"
              className="tap-44 flex w-full items-start justify-between gap-2 text-left"
              onClick={() => onOpen(c.key)}
              aria-expanded={aberto}
            >
              <span className="min-w-0">
                <span className="c-group-count block">{c.count}</span>
                <span
                  className={`c-group-label block truncate font-medium${c.destaque ? " text-amber-600 dark:text-amber-400" : ""}`}
                >
                  {c.label}
                </span>
                {c.hint && (
                  <span
                    className="mt-0.5 block truncate text-[10px] uppercase tracking-wide"
                    style={{ color: "var(--muted)", opacity: 0.8 }}
                    data-card-hint={c.hint}
                  >
                    {c.hint}
                  </span>
                )}
                <span className="mt-0.5 block text-[11px]" style={{ color: "var(--muted)", opacity: 0.65 }}>
                  {c.count === 0 ? "sem registos" : c.inline ? "abre aqui" : "vista dedicada"}
                </span>
              </span>
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
            {expandeAqui && (
              <div className="mt-3 space-y-2 border-t border-border pt-3">{renderInline!(c)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}