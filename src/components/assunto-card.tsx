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
  extra,
  actions,
}: {
  titulo: string;
  frase?: ReactNode;
  meta?: ReactNode;
  tag?: ReactNode;
  destaque?: boolean;
  extra?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={destaque ? "" : "c-card c-card-hover p-3.5"}>
      {tag ? <div className="c-spot-tag mb-2">{tag}</div> : null}
      {destaque ? (
        <h2 className="c-serif text-[18px] font-medium">{titulo}</h2>
      ) : (
        <div className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>{titulo}</div>
      )}
      {frase ? (
        <p
          className={destaque ? "mt-1.5 text-[13.5px] leading-relaxed" : "mt-0.5 text-xs"}
          style={{ color: destaque ? "var(--ink-soft)" : "var(--ink)" }}
        >
          {frase}
        </p>
      ) : null}
      {meta ? <div className="c-muted mt-0.5 text-xs">{meta}</div> : null}
      {extra}
      {actions ? <div className="mt-3 flex flex-wrap items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}
