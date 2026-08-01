import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Badge, Empty, PageTitle, SectionTitle, Source } from "@/components/admin/ui";
import { getConsultantDetail } from "@/lib/admin/consultor.functions";
import { updateAccess, deactivateAccess, reactivateAccess } from "@/lib/admin/acessos.functions";
import { getMyAdminRole } from "@/lib/admin.functions";
import { tierLabel, type SubscriptionTier } from "@/lib/subscription/tiers";
import { fmtScore100, fmtPct } from "@/lib/admin/metrics-format";

export const Route = createFileRoute("/admin/consultor/$id")({
  head: () => ({ meta: [{ title: "Ficha de consultor — Afonso admin" }] }),
  component: ConsultorPage,
});

const TIERS: SubscriptionTier[] = ["base", "consultor", "pro", "hub"];

function fmtDate(v: string | null) {
  return v ? new Date(v).toLocaleDateString("pt-PT") : "—";
}
function fmtDateTime(v: string | null) {
  return v ? new Date(v).toLocaleString("pt-PT") : "—";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="admin-card p-3">
      <div className="mini" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

function ConsultorPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const detailFn = useServerFn(getConsultantDetail);
  const roleFn = useServerFn(getMyAdminRole);
  const updateFn = useServerFn(updateAccess);
  const deactivateFn = useServerFn(deactivateAccess);
  const reactivateFn = useServerFn(reactivateAccess);

  const { data: me } = useQuery({ queryKey: ["admin", "my-role"], queryFn: () => roleFn() });
  const isSuper = me?.role === "super_admin";
  const { data, isPending, error } = useQuery({
    queryKey: ["admin", "consultor", id],
    queryFn: () => detailFn({ data: { userId: id } }),
  });

  const [tier, setTier] = useState<string>("");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "consultor", id] });
    qc.invalidateQueries({ queryKey: ["admin", "access-users"] });
    qc.invalidateQueries({ queryKey: ["admin", "beta-testers"] });
  };
  const run = (label: string, p: Promise<unknown>) =>
    p.then(() => { toast.success(label); refresh(); })
     .catch((e: Error) => toast.error(e.message || "Não foi possível concluir."));

  if (isPending) return <p className="sub">A carregar…</p>;
  if (error || !data) return <Empty>Não foi possível abrir esta ficha.</Empty>;

  const p = data.profile;
  const selectedTier = tier || p.tier;

  return (
    <div>
      <div className="mini mb-2">
        <Link to="/admin/utilizadores" className="admin-link">← Utilizadores &amp; planos</Link>
        {" · "}
        <Link to="/admin/beta" className="admin-link">Beta testers</Link>
      </div>
      <PageTitle
        title={p.name || p.email || "Consultor"}
        sub="Ficha da conta: perfil, atividade, volume de trabalho e histórico administrativo. O conteúdo das conversas não é mostrado aqui."
      />

      <SectionTitle first>Perfil</SectionTitle>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
        <Field label="Nome">{p.name || "—"}</Field>
        <Field label="Email">{p.email || "—"}</Field>
        <Field label="Telefone">{p.phone || "—"}</Field>
        <Field label="Canais ligados">{p.channels.length ? p.channels.join(", ") : "nenhum"}</Field>
        <Field label="Plano"><Badge tone={p.tier === "base" ? "warn" : "ok"}>{tierLabel(p.tier as SubscriptionTier)}</Badge></Field>
        <Field label="Conta criada">{fmtDate(p.createdAt)}</Field>
        <Field label="Período de teste">
          {p.isBeta
            ? p.betaExpiresAt
              ? `sim, até ${fmtDate(p.betaExpiresAt)} (${p.betaDaysLeft} dia(s))`
              : "sim, sem prazo"
            : "não"}
        </Field>
        <Field label="Nome do assessor">{p.assessorName || "—"}</Field>
        <Field label="Tipo de conta">{p.accountKind || "—"}</Field>
      </div>
      <Source>profiles × channel_links</Source>

      <SectionTitle>Atividade</SectionTitle>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label="Mensagens (últimos 30 dias)">{data.activity.messages30d}</Field>
        <Field label="Último contacto">{fmtDateTime(data.activity.lastContactAt)}</Field>
        <Field label="Canal mais usado">
          {data.activity.topChannel ?? "—"}
          {data.activity.byChannel.length > 1 ? (
            <div className="mini" style={{ color: "var(--muted)" }}>
              {data.activity.byChannel.map((c) => `${c.channel}: ${c.count}`).join(" · ")}
            </div>
          ) : null}
        </Field>
      </div>
      <Source>assessor_messages (só metadados: canal e data)</Source>

      <SectionTitle>Volume de negócio</SectionTitle>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Field label="Pessoas">{data.volume.people}</Field>
        <Field label="Imóveis">{data.volume.properties}</Field>
        <Field label="Negócios em curso">{data.volume.openDeals}</Field>
        <Field label="Seguimentos pendentes">{data.volume.pendingFollowUps}</Field>
      </div>
      <p className="mini mt-2" style={{ color: "var(--muted)" }}>
        Contagens simples. Nomes, moradas e conteúdo dos registos não são acessíveis à administração.
      </p>
      <Source>people × properties × opportunities × follow_ups (contagens)</Source>

      <SectionTitle>Qualidade desta conta</SectionTitle>
      {data.quality.samples === 0 ? (
        <Empty note="Só há métricas depois de existirem turnos avaliados nesta conta.">Sem dados de qualidade.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="ATS (confiança)">{data.quality.ats === null ? "—" : fmtScore100(data.quality.ats)}</Field>
          <Field label="AQS (qualidade)">{data.quality.aqs === null ? "—" : fmtPct(data.quality.aqs)}</Field>
        </div>
      )}
      <Source>assistant_trust_scores × assessor_quality_scores</Source>

      <SectionTitle>Ações</SectionTitle>
      <div className="admin-card flex flex-wrap items-end gap-3 p-4">
        <div>
          <div className="mini mb-1" style={{ color: "var(--muted)" }}>Plano</div>
          <select className="admin-input" value={selectedTier} onChange={(e) => setTier(e.target.value)} disabled={!isSuper}>
            {TIERS.map((t) => <option key={t} value={t}>{tierLabel(t)}</option>)}
          </select>
        </div>
        <button
          type="button"
          className="admin-btn-primary tap-44"
          disabled={!isSuper || selectedTier === p.tier}
          onClick={() => run("Plano atualizado.", updateFn({ data: { target_user_id: p.id, subscription_tier: selectedTier as SubscriptionTier } }))}
        >Guardar plano</button>
        <button
          type="button"
          className="admin-btn tap-44"
          disabled={!isSuper || !p.isBeta}
          onClick={() => run("Período de teste terminado.", updateFn({ data: { target_user_id: p.id, is_beta_tester: false, beta_expires_at: "" } }))}
        >Terminar beta</button>
        <button
          type="button"
          className="admin-link-danger tap-44"
          disabled={!isSuper || me?.userId === p.id}
          onClick={() => run("Conta desativada.", deactivateFn({ data: { target_user_id: p.id, reason: "Desativado a partir da ficha de consultor." } }))}
        >Desativar acesso</button>
        <button
          type="button"
          className="admin-link tap-44"
          disabled={!isSuper}
          onClick={() => run("Conta reativada.", reactivateFn({ data: { target_user_id: p.id, reason: "Reativado a partir da ficha de consultor." } }))}
        >Reativar acesso</button>
      </div>

      <SectionTitle>Histórico administrativo desta conta</SectionTitle>
      {data.audit.length === 0 ? (
        <Empty>Sem eventos registados para esta conta.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead><tr><th>Data</th><th>Ação</th><th>Recurso</th><th>Motivo</th></tr></thead>
            <tbody>
              {data.audit.map((a) => (
                <tr key={a.id}>
                  <td className="mini whitespace-nowrap">{fmtDateTime(a.createdAt)}</td>
                  <td className="mono mini">{a.action}</td>
                  <td className="mini">{a.resource ?? "—"}</td>
                  <td className="mini" style={{ color: "var(--muted)" }}>{a.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Source>admin_audit_logs</Source>
    </div>
  );
}