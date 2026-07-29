import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useEffectiveTier } from "@/lib/subscription/use-effective-tier";
import { tierAtLeast, tierLabel, type SubscriptionTier } from "@/lib/subscription/tiers";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

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
        <div className="py-16 text-center text-sm text-muted-foreground">A carregar…</div>
      </AppShell>
    );
  }

  if (!tierAtLeast(data?.tier, min)) {
    return (
      <AppShell>
        <PageHeader title={title} />
        <div className="mx-auto max-w-md rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
          <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground">
            <Lock className="h-4 w-4" />
          </div>
          <p className="text-sm text-muted-foreground">
            {title} faz parte do plano {tierLabel(min)}. O teu plano actual é {tierLabel(data?.tier)}.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/hoje">Voltar ao Hoje</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return <>{children}</>;
}