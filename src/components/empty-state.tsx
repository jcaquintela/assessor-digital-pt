import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

/**
 * Estado vazio com uma saída clara: nunca deixar o consultor num ecrã morto.
 * Ou tem botão (onAction) ou tem link (to) — nunca só texto solto.
 */
export function EmptyState({
  title,
  hint,
  actionLabel,
  onAction,
  to,
  icon,
}: {
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
  to?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-center">
      {icon ? <div className="mb-2 flex justify-center text-muted-foreground">{icon}</div> : null}
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="tap-44 mt-3 inline-flex items-center rounded-lg bg-primary px-3 py-2 text-[13px] font-semibold text-primary-foreground"
        >
          {actionLabel}
        </button>
      ) : null}
      {actionLabel && !onAction && to ? (
        <Link
          to={to}
          className="tap-44 mt-3 inline-flex items-center rounded-lg bg-primary px-3 py-2 text-[13px] font-semibold text-primary-foreground"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
