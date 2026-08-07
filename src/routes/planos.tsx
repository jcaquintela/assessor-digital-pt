import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Lock } from "lucide-react";
import { listPublishedPlans } from "@/lib/subscription/plans.functions";
import {
  MODULE_LABEL,
  planSummary,
  tierLabel,
  type SubscriptionTier,
} from "@/lib/subscription/tiers";

export const Route = createFileRoute("/planos")({
  head: () => ({
    meta: [
      { title: "Planos — Afonso" },
      { name: "description", content: "Compara os planos do Afonso, o teu assessor pessoal: módulos incluídos e nível de autonomia." },
      { property: "og:title", content: "Planos — Afonso" },
      { property: "og:description", content: "Compara os planos do Afonso, o teu assessor pessoal: módulos incluídos e nível de autonomia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlanosPage,
});

const ORDER: SubscriptionTier[] = ["base", "consultor", "pro", "hub"];

function euro(v: number | null | undefined): string {
  if (v === null || v === undefined) return "Sob consulta";
  if (v === 0) return "Grátis";
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v) + "/mês";
}

function PlanosPage() {
  const fetchPlans = useServerFn(listPublishedPlans);
  const { data } = useQuery({ queryKey: ["plans", "published"], queryFn: () => fetchPlans() });
  const prices = new Map((data?.plans ?? []).map((p) => [p.tier, p]));

  return (
    <div className="consult-root min-h-screen px-4 py-10">
      <main className="mx-auto w-full max-w-5xl">
        <p className="c-eyebrow">Afonso</p>
        <h1 className="c-page-title mt-1">Planos</h1>
        <p className="c-muted mt-2 max-w-2xl text-[14px] leading-relaxed">
          Todos os planos incluem o Afonso na conversa. O que muda é quanto ele
          pode fazer sozinho e que áreas ficam disponíveis no painel.
        </p>

        <section id="planos" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ORDER.map((tier) => {
            const s = planSummary(tier);
            const cfg = prices.get(tier);
            return (
              <article key={tier} className="c-card flex flex-col p-5">
                <h2 className="text-[16px] font-semibold">{tierLabel(tier)}</h2>
                <div className="mt-1 text-[18px] font-semibold" style={{ color: "var(--brass-dark)" }}>
                  {euro(cfg?.price_month)}
                </div>
                {cfg?.notes ? <p className="c-muted mt-1 text-[12px]">{cfg.notes}</p> : null}
                <p className="c-eyebrow mt-4">Autonomia</p>
                <p className="text-[13.5px]">{s.autonomyLabel}</p>
                <p className="c-eyebrow mt-4">Áreas do painel</p>
                <ul className="mt-1 flex flex-col gap-1.5">
                  {s.modules.map((m) => (
                    <li key={m.path} className="flex items-center gap-2 text-[13px]">
                      {m.available ? (
                        <Check className="h-3.5 w-3.5" style={{ color: "var(--sage-dark, var(--sage))" }} />
                      ) : (
                        <Lock className="c-muted h-3.5 w-3.5" />
                      )}
                      <span className={m.available ? "" : "c-muted"}>{MODULE_LABEL[m.path]}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </section>

        <p className="c-muted mt-8 text-[13px]">
          Para mudar de plano, fala connosco — a mudança automática ainda não está disponível.{" "}
          <Link to="/definicoes" className="underline">Voltar às Definições</Link>
        </p>
      </main>
    </div>
  );
}