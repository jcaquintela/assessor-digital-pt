import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listPlanConfigs, savePlanConfig } from "@/lib/admin/afonso.functions";
import { Badge, Empty, PageTitle, SectionTitle } from "@/components/admin/ui";
import { AUTONOMY_CAP_BY_TIER, MODULE_MIN_TIER, tierLabel, type SubscriptionTier } from "@/lib/subscription/tiers";

type PricingMode = "paid" | "invite_only" | "free_beta" | "on_request";

const PRICING_MODE_LABEL: Record<PricingMode, string> = {
  paid: "Pago (precisa de preço)",
  invite_only: "Apenas por convite",
  free_beta: "Beta gratuito",
  on_request: "Preço sob consulta",
};

type PlanCfg = { price_month: number | null; status: string; pricing_mode?: string } | undefined;

function missingPrice(cfg: PlanCfg) {
  return (cfg?.pricing_mode ?? "paid") === "paid" && cfg?.price_month == null;
}

function publishedLabel(cfg: PlanCfg) {
  const mode = (cfg?.pricing_mode ?? "paid") as PricingMode;
  if (mode === "paid") return cfg?.price_month == null ? "Publicado sem preço — corrigir" : "Publicado";
  return `Publicado · ${PRICING_MODE_LABEL[mode]}`;
}

export const Route = createFileRoute("/admin/planos")({
  head: () => ({ meta: [{ title: "Planos & preços — Afonso admin" }] }),
  component: PlanosPage,
});

const TIERS: SubscriptionTier[] = ["base", "consultor", "pro", "hub"];

const CHANNEL: Record<SubscriptionTier, string> = {
  base: "Telegram",
  consultor: "WhatsApp",
  pro: "WhatsApp",
  hub: "WhatsApp · equipa",
};

const AUTONOMY_LABEL = { conservador: "Conservador", balanced: "Equilibrado", proativo: "Proativo" } as const;

const BASE_MODULES = "Hoje, Pessoas, Agenda, Drive, Diversos";

const MODULE_LABEL: Record<string, string> = {
  "/imoveis": "Imóveis",
  "/prospecao": "Prospeção",
  "/negocio": "Negócio",
};

// Módulos por tier lidos de MODULE_MIN_TIER (mesma fonte usada pelo TierGate).
function modulesFor(tier: SubscriptionTier): string {
  const unlocked = Object.entries(MODULE_MIN_TIER)
    .filter(([, min]) => min === tier)
    .map(([path]) => MODULE_LABEL[path] ?? path.replace("/", ""));
  if (tier === "base") return BASE_MODULES;
  if (!unlocked.length) return tier === "hub" ? "+ vista agregada" : "—";
  return `+ ${unlocked.join(", ")}`;
}

function PlanosPage() {
  const list = useServerFn(listPlanConfigs);
  const save = useServerFn(savePlanConfig);
  const qc = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ["admin", "plan-configs"], queryFn: () => list() });
  const [prices, setPrices] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data) return;
    setPrices(Object.fromEntries(data.map((p) => [p.tier, p.price_month == null ? "" : String(p.price_month)])));
  }, [data]);

  const mutation = useMutation({
    mutationFn: (input: {
      tier: SubscriptionTier;
      price_month?: number | null;
      pricing_mode?: PricingMode;
      status?: "draft" | "published";
    }) =>
      save({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "plan-configs"] });
      toast.success("Plano atualizado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isPending || !data) return <p className="sub">A carregar…</p>;

  const byTier = new Map(data.map((p) => [p.tier, p]));


  return (
    <div>
      <PageTitle
        title="Planos & preços"
        sub="A configuração real dos 4 níveis — muda aqui, não no código. Preços por confirmar, sem problema em ficarem em rascunho."
      />

      <table>
        <thead>
          <tr><th>Plano</th><th>Preço/mês</th><th>Como é vendido</th><th>Canal</th><th>Autonomia máx.</th><th>Módulos</th><th>Estado</th><th>Ações</th></tr>
        </thead>
        <tbody>
          {TIERS.map((tier) => {
            const cfg = byTier.get(tier);
            const published = cfg?.status === "published";
            const isFree = tier === "base";
            return (
              <tr key={tier}>
                <td><Badge tone={tier === "base" ? "warn" : "ok"}>{tierLabel(tier)}</Badge></td>
                <td>
                  {isFree ? (
                    <span className="mono">Grátis</span>
                  ) : (
                    <input
                      className="admin-input w-20"
                      placeholder="€ / mês"
                      value={prices[tier] ?? ""}
                      onChange={(e) => setPrices((p) => ({ ...p, [tier]: e.target.value }))}
                      onBlur={(e) => {
                        const raw = e.target.value.trim().replace(",", ".");
                        const value = raw === "" ? null : Number(raw);
                        if (value != null && Number.isNaN(value)) { toast.error("Preço inválido."); return; }
                        if ((cfg?.price_month ?? null) === value) return;
                        mutation.mutate({ tier, price_month: value });
                      }}
                    />
                  )}
                </td>
                <td>
                  {isFree ? (
                    <span className="mini">Grátis</span>
                  ) : (
                    <select
                      className="admin-input"
                      value={(cfg?.pricing_mode ?? "paid") as PricingMode}
                      onChange={(e) => mutation.mutate({ tier, pricing_mode: e.target.value as PricingMode })}
                    >
                      {Object.entries(PRICING_MODE_LABEL).map(([v, label]) => (
                        <option key={v} value={v}>{label}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="mini">{CHANNEL[tier]}</td>
                <td className="mini">{AUTONOMY_LABEL[AUTONOMY_CAP_BY_TIER[tier]]}</td>
                <td className="mini">{modulesFor(tier)}</td>
                <td>
                  <Badge tone={published ? (missingPrice(cfg) ? "bad" : "ok") : "warn"}>
                    {published ? publishedLabel(cfg) : "Rascunho"}
                  </Badge>
                </td>
                <td className="mini">
                  <button
                    type="button"
                    className="admin-link"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ tier, status: published ? "draft" : "published" })}
                  >
                    {published ? "Passar a rascunho" : "Publicar"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <SectionTitle>Antes de publicar um preço</SectionTitle>
      <Empty note="isto evita mostrar ao cliente um plano publicado sem saber quanto custa">
        Um plano "Rascunho" nunca é mostrado na landing page nem cobrado a ninguém. Para publicar, o plano precisa de
        preço — ou de dizer porque não tem: apenas por convite, beta gratuito ou preço sob consulta.
      </Empty>
    </div>
  );
}
