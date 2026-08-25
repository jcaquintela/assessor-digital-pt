import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAccountMode } from "@/lib/subscription/account-mode.functions";
import { useHasSession } from "@/hooks/use-has-session";

/**
 * Descer de plano não migra nem apaga a conta: durante 90 dias o histórico
 * completo continua acessível em leitura. Este aviso é informativo, nunca
 * alarmista.
 */
export function AccountArchiveBanner() {
  const fn = useServerFn(getAccountMode);
  const hasSession = useHasSession();
  const { data } = useQuery({
    queryKey: ["account-mode"],
    queryFn: () => fn(),
    enabled: hasSession === true,
    retry: false,
    staleTime: 5 * 60_000,
  });
  if (!data?.readOnlyArchive || !data.notice) return null;
  return (
    <div
      className="mb-4 rounded-xl px-4 py-3 text-[13px] leading-relaxed"
      style={{ border: "1px solid var(--line)", background: "color-mix(in srgb, var(--paper) 70%, transparent)" }}
      role="status"
    >
      {data.notice}
    </div>
  );
}