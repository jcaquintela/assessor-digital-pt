import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle } from "lucide-react";
import { countWriteErrors } from "@/lib/admin/write-errors.functions";

function useWriteErrorCount() {
  const fn = useServerFn(countWriteErrors);
  return useQuery({
    queryKey: ["admin", "write-errors", "count"],
    queryFn: () => fn(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Aviso no topo do admin quando houve falhas de gravação nas últimas 24h. */
export function WriteErrorsAlert() {
  const { data } = useWriteErrorCount();
  const n = data?.last24h ?? 0;
  if (!n) return null;
  return (
    <Link
      to="/admin/erros-escrita"
      className="mb-4 flex items-center gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 transition hover:bg-red-100 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <strong>{n === 1 ? "1 erro de escrita nas últimas 24h" : `${n} erros de escrita nas últimas 24h`}</strong>
        {data?.latestTool ? ` — o mais recente em ${data.latestTool}` : ""}
        {data?.latestError ? `: ${data.latestError}` : "."}
      </span>
      <span className="shrink-0 font-medium underline">Investigar</span>
    </Link>
  );
}

/** Badge numérico para o item de menu. */
export function WriteErrorsBadge() {
  const { data } = useWriteErrorCount();
  const n = data?.last24h ?? 0;
  if (!n) return null;
  return (
    <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold leading-5 text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}
