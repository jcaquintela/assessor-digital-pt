import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageTitle, SectionTitle, Empty, Badge, Source } from "@/components/admin/ui";
import { listAuditLogs, listMfaRequired } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/auditoria-seguranca")({
  head: () => ({ meta: [{ title: "Auditoria & segurança — Afonso admin" }] }),
  component: AuditoriaSegurancaPage,
});

// Ações que TÊM de aparecer em auditoria. Se uma delas nunca aparecer no
// registo, ou não foi usada ainda ou deixou de gravar — a página diz qual.
const EXPECTED_ACTIONS: { action: string; label: string }[] = [
  { action: "user.access_created", label: "Criação de acesso" },
  { action: "user.access_updated", label: "Alteração de acesso" },
  { action: "user.access_deactivated", label: "Desativação de acesso" },
  { action: "role.grant", label: "Atribuição de papel" },
  { action: "role.revoke", label: "Remoção de papel" },
  { action: "promo_code.created", label: "Código promocional criado" },
  { action: "promo_code.revoked", label: "Código promocional revogado" },
  { action: "broadcast.sent", label: "Comunicação enviada" },
  { action: "broadcast.email", label: "Comunicação por email" },
  { action: "flag.upsert", label: "Alteração de flag" },
  { action: "plan_config.update", label: "Alteração de plano/preço" },
  { action: "security.mfa_required", label: "MFA obrigatório" },
];

function AuditoriaSegurancaPage() {
  const auditFn = useServerFn(listAuditLogs);
  const mfaFn = useServerFn(listMfaRequired);
  const { data, isLoading } = useQuery({ queryKey: ["admin", "audit"], queryFn: () => auditFn() });
  const { data: mfa } = useQuery({ queryKey: ["admin", "mfa"], queryFn: () => mfaFn() });

  const rows = (data ?? []) as any[];
  const seen = new Set(rows.map((r) => r.action));

  return (
    <div>
      <PageTitle
        title="Auditoria & segurança"
        sub="Registo imutável de tudo o que a administração faz, mais as regras de acesso que protegem os dados dos consultores."
      />

      <SectionTitle first>Cobertura de auditoria</SectionTitle>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
        {EXPECTED_ACTIONS.map((a) => (
          <div key={a.action} className="admin-card flex items-center justify-between gap-2 p-3">
            <div>
              <div className="mini"><strong>{a.label}</strong></div>
              <div className="mono mini" style={{ color: "var(--muted)" }}>{a.action}</div>
            </div>
            <Badge tone={seen.has(a.action) ? "ok" : "warn"}>{seen.has(a.action) ? "grava" : "sem registos"}</Badge>
          </div>
        ))}
      </div>
      <p className="mini mt-2" style={{ color: "var(--muted)" }}>
        "Sem registos" significa apenas que a ação ainda não foi usada nos últimos 200 eventos — o código grava-a na mesma.
      </p>

      <SectionTitle>Últimos 200 eventos</SectionTitle>
      {isLoading ? (
        <Empty>A carregar…</Empty>
      ) : rows.length === 0 ? (
        <Empty>Sem eventos registados.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr><th>Data</th><th>Ação</th><th>Admin</th><th>Alvo</th><th>Recurso</th><th>Motivo</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="mini whitespace-nowrap">{new Date(row.created_at).toLocaleString("pt-PT")}</td>
                  <td className="mono mini">{row.action}</td>
                  <td className="mono mini">{row.admin_user_id?.slice(0, 8)}…</td>
                  <td className="mono mini">{row.target_user_id ? `${row.target_user_id.slice(0, 8)}…` : "—"}</td>
                  <td className="mini">{row.resource_type ? `${row.resource_type}${row.resource_id ? ":" + row.resource_id : ""}` : "—"}</td>
                  <td className="mini" style={{ color: "var(--muted)" }}>{row.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Source>admin_audit_logs</Source>

      <SectionTitle>MFA obrigatório</SectionTitle>
      {((mfa as any[]) ?? []).length === 0 ? (
        <Empty note="A imposição no login liga quando o MFA do backend for ativado.">Nenhum utilizador marcado.</Empty>
      ) : (
        <ul className="mono mini space-y-1">
          {((mfa as any[]) ?? []).map((r) => <li key={r.user_id}>{r.user_id}</li>)}
        </ul>
      )}

      <SectionTitle>Acesso de suporte temporário</SectionTitle>
      <Empty note="Terá de ser autorizado pelo próprio consultor, com motivo, duração e registo em auditoria.">
        Em preparação. Por defeito, administradores não veem conversas, contactos, oportunidades, despesas, comissões ou documentos.
      </Empty>
    </div>
  );
}
