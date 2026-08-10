import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Lightbulb } from "lucide-react";
import { countUnreadTeamSuggestions } from "@/lib/admin/suggestions.functions";

/** Contagem de sugestões por ler, partilhada pelo badge do menu e pelo aviso. */
export function useUnreadSuggestions() {
  const fn = useServerFn(countUnreadTeamSuggestions);
  return useQuery({
    queryKey: ["admin", "suggestions", "unread"],
    queryFn: () => fn(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/** Aviso no topo do admin quando há sugestões novas por ler. */
export function UnreadSuggestionsAlert() {
  const { data } = useUnreadSuggestions();
  const unread = data?.unread ?? 0;
  const seen = useRef<number | null>(null);

  useEffect(() => {
    if (seen.current !== null && unread > seen.current) {
      toast(
        unread - seen.current === 1
          ? "Nova sugestão de um consultor"
          : `${unread - seen.current} novas sugestões de consultores`,
        { description: "Abre Qualidade → Sugestões dos consultores." },
      );
    }
    seen.current = unread;
  }, [unread]);

  if (!unread) return null;
  return (
    <Link
      to="/admin/sugestoes"
      className="mb-4 flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
    >
      <Lightbulb className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <strong>
          {unread === 1 ? "1 sugestão por ler" : `${unread} sugestões por ler`}
        </strong>
        {data?.latestFrom ? ` — a mais recente de ${data.latestFrom}.` : "."}
      </span>
      <span className="shrink-0 font-medium underline">Ver</span>
    </Link>
  );
}

/** Badge numérico para o item de menu. */
export function UnreadSuggestionsBadge() {
  const { data } = useUnreadSuggestions();
  const unread = data?.unread ?? 0;
  if (!unread) return null;
  return (
    <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-[11px] font-semibold leading-5 text-amber-950">
      {unread > 99 ? "99+" : unread}
    </span>
  );
}
