import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useEffectiveTier } from "@/lib/subscription/use-effective-tier";
import { tierAtLeast, tierLabel, type SubscriptionTier } from "@/lib/subscription/tiers";
import { AppShell, PageHeader } from "@/components/app-shell";

// Guard de rota por tier. Esconder o link no menu não chega — o acesso
// directo por URL tem de dar um estado coerente, não conteúdo do módulo.
export function TierGate({
  min,
  title,
  children,
}: {
  min: SubscriptionTier;
  title: string;
  children: ReactNode;
}) {
  const { data, isPending } = useEffectiveTier();

  // Enquanto não sabemos o tier, não mostramos o módulo.
  if (isPending) {
    return (
      <AppShell>
        <div className="c-muted py-16 text-center text-sm">A carregar…</div>
      </AppShell>
    );
  }

  if (!tierAtLeast(data?.tier, min)) {
    return (
      <AppShell>
        <PageHeader title={title} />
        <div className="c-lock">
          <div className="c-lock-icon">
            <Lock className="h-4.5 w-4.5" />
          </div>
          <div className="c-serif text-lg">
            {title} faz parte do plano {tierLabel(min)}
          </div>
          <p className="c-muted mt-2 text-[13px] leading-relaxed">
            O teu plano atual é {tierLabel(data?.tier)}. Fala com o Afonso para saberes mais.
          </p>
          <Link to="/assessor" className="c-cta mt-5">
            Saber mais
          </Link>
        </div>
      </AppShell>
    );
  }

  return <>{children}</>;
}