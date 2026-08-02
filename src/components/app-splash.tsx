import { BrandMark } from "@/components/brand-mark";

/**
 * Ecrã de carregamento / splash do Afonso.
 * Usado como pendingComponent global do router (mobile e desktop).
 */
export function AppSplash() {
  return (
    <div
      className="flex min-h-[100dvh] w-full flex-col items-center justify-center gap-4 px-6"
      style={{ background: "#132447" }}
      role="status"
      aria-live="polite"
    >
      <BrandMark size={96} className="rounded-3xl shadow-lg" />
      <div className="text-center">
        <div className="brand text-lg font-medium" style={{ color: "#e9c46a" }}>
          Afonso
        </div>
        <div className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.65)" }}>
          o teu assessor
        </div>
      </div>
      <span className="sr-only">A carregar…</span>
    </div>
  );
}