import { Eye } from "lucide-react";
import {
  readPreviewTier,
  setPreviewTier,
  useIsSuperAdmin,
  usePreviewTier,
} from "@/lib/subscription/tier-preview";
import { tierLabel, type SubscriptionTier } from "@/lib/subscription/tiers";

const TIERS: SubscriptionTier[] = ["base", "consultor", "pro", "hub"];

// Barra fixa e permanente enquanto a simulação está activa.
export function TierPreviewBanner() {
  const preview = usePreviewTier();
  if (!preview) return null;
  return (
    <div
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-3 px-3 py-2 text-[12px] font-medium"
      style={{ background: "var(--brass-dark, #8a6b1f)", color: "#fff" }}
      role="status"
    >
      <Eye className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        A simular: {tierLabel(preview)} — o teu plano e faturação reais não mudaram
      </span>
      <button
        type="button"
        onClick={() => setPreviewTier(null)}
        className="shrink-0 rounded border border-white/50 px-2 py-0.5 hover:bg-white/15"
      >
        Sair da simulação
      </button>
    </div>
  );
}

// Seletor nas Definições. Só existe para super admin.
export function TierPreviewSection() {
  const isSuper = useIsSuperAdmin();
  const preview = usePreviewTier();
  if (!isSuper) return null;
  const current = preview ?? readPreviewTier();

  return (
    <section className="c-card p-5">
      <h2 className="c-section-title mb-4">Ver como (simulação de plano)</h2>
      <p className="c-muted text-[13px] leading-relaxed">
        Mostra o dashboard como um consultor desse plano o veria. É só visual: nada é
        escrito na tua conta, o teu plano e faturação reais mantêm-se, e o que criares
        durante a simulação fica na tua conta normal. Sai sozinha quando terminas sessão.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {TIERS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setPreviewTier(t)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              current === t ? "border-current font-semibold" : "c-muted"
            }`}
            style={{ borderColor: "var(--line)" }}
          >
            {tierLabel(t)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPreviewTier(null)}
          className="rounded-md border px-3 py-1.5 text-sm"
          style={{ borderColor: "var(--line)" }}
          disabled={!current}
        >
          Sair da simulação
        </button>
      </div>
    </section>
  );
}
