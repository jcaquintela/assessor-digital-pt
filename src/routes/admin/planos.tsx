import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listPlanConfigs, savePlanConfig } from "@/lib/admin/afonso.functions";
import { Badge, Empty, PageTitle, SectionTitle } from "@/components/admin/ui";
import { AUTONOMY_CAP_BY_TIER, MODULE_MIN_TIER, tierLabel, type SubscriptionTier } from "@/lib/subscription/tiers";

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
    mutationFn: (input: { tier: SubscriptionTier; price_month?: number | null; status?: "draft" | "published" }) =>
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
          <tr><th>Plano</th><th>Preço/mês</th><th>Canal</th><th>Autonomia máx.</th><th>Módulos</th><th>Estado</th><th>Ações</th></tr>
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
                <td className="mini">{CHANNEL[tier]}</td>
                <td className="mini">{AUTONOMY_LABEL[AUTONOMY_CAP_BY_TIER[tier]]}</td>
                <td className="mini">{modulesFor(tier)}</td>
                <td><Badge tone={published ? "ok" : "warn"}>{published ? "Publicado" : "Rascunho"}</Badge></td>
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
      <Empty note="isto evita cobrar por engano um preço que ainda estás a testar">
        Um plano "Rascunho" nunca é mostrado na landing page nem cobrado a ninguém — só "Publicado" fica visível a clientes.
      </Empty>
    </div>
  );
}
