import type { ReactNode } from "react";

/**
 * Cartão único usado em Hoje ("Isto merece atenção" e prioridades),
 * Atrasados e Esta semana. Garante a mesma regra em todo o lado:
 * título = assunto, frase = explicação + ação sugerida.
 */
export function AssuntoCard({
  titulo,
  frase,
  meta,
  tag,
  destaque = false,
  plano = false,
  extra,
  actions,
}: {
  titulo: string;
  frase?: ReactNode;
  meta?: ReactNode;
  tag?: ReactNode;
  destaque?: boolean;
  /** Sem moldura própria: já vem dentro de um cartão. */
  plano?: boolean;
  extra?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={destaque || plano ? "" : "c-card c-card-hover p-3.5"}>
      {tag && !plano ? <div className="c-spot-tag mb-2">{tag}</div> : null}
      {destaque ? (
        <h2 className="c-serif text-[18px] font-medium">{titulo}</h2>
      ) : plano ? (
        <div className="flex items-center gap-2">
          {tag}
          <span className="truncate text-sm font-medium">{titulo}</span>
        </div>
      ) : (
        <div className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>{titulo}</div>
      )}
      {frase ? (
        <p
          className={destaque ? "mt-1.5 text-[13.5px] leading-relaxed" : "mt-1 text-xs"}
          style={{ color: destaque ? "var(--ink-soft)" : "var(--ink)" }}
        >
          {frase}
        </p>
      ) : null}
      {meta ? <div className="c-muted mt-0.5 text-xs text-muted-foreground">{meta}</div> : null}
      {extra}
      {actions ? <div className="mt-3 flex flex-wrap items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}
