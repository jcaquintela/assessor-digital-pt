import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSystemHealth } from "@/lib/admin/afonso.functions";

// Estado dos sistemas calculado UMA vez. Qualquer página admin que precise
// do estado de uma integração lê daqui — nunca recalcula.
export function useSystemHealth() {
  const fn = useServerFn(getSystemHealth);
  return useQuery({
    queryKey: ["admin", "system-health"],
    queryFn: () => fn(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function HealthStrip() {
  const { data, isPending } = useSystemHealth();
  return (
    <div className="healthstrip">
      {(data?.items ?? [
        { key: "engine", label: "Motor v3", level: "warn", detail: "" },
        { key: "whatsapp", label: "WhatsApp", level: "warn", detail: "" },
        { key: "supabase", label: "Supabase", level: "warn", detail: "" },
        { key: "telegram", label: "Telegram", level: "warn", detail: "" },
      ]).map((i) => (
        <span key={i.key} className="hs-item" title={i.detail}>
          <span className={`hs-dot ${i.level}`} />
          {i.label}
        </span>
      ))}
      <span className="hs-note">
        {isPending ? "a verificar…" : "calculado uma vez · todas as páginas leem daqui"}
      </span>
    </div>
  );
}
