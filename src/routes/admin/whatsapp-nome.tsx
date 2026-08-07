import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageTitle, SectionTitle, Empty, Badge, Source } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { getWhatsappDisplayName, runWhatsappDisplayNameSync } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/whatsapp-nome")({
  head: () => ({ meta: [{ title: "Nome do WhatsApp — Afonso admin" }] }),
  component: WhatsappNomePage,
});

const OUTCOME_LABEL: Record<string, { label: string; tone: "ok" | "warn" | "bad" }> = {
  submitted: { label: "Pedido submetido", tone: "ok" },
  already_target: { label: "Já é «Afonso»", tone: "ok" },
  pending_review: { label: "Em revisão na Meta", tone: "warn" },
  submit_failed: { label: "Meta recusou", tone: "bad" },
  no_credentials: { label: "Sem credenciais", tone: "bad" },
};

function outcomeOf(row: any): string {
  if (row?.metadata?.outcome) return String(row.metadata.outcome);
  if (row.action === "whatsapp.display_name.requested") return "submitted";
  if (row.action === "whatsapp.display_name.request_failed") return "submit_failed";
  return "desconhecido";
}

function WhatsappNomePage() {
  const fetchFn = useServerFn(getWhatsappDisplayName);
  const syncFn = useServerFn(runWhatsappDisplayNameSync);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "whatsapp-nome"],
    queryFn: () => fetchFn(),
  });

  const sync = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "whatsapp-nome"] }),
  });

  const attempts = (data?.attempts ?? []) as any[];
  const state = data?.state ?? null;

  return (
    <div>
      <PageTitle
        title="Nome do WhatsApp"
        sub="Histórico de cada tentativa da rotina para pôr o nome público do número como «Afonso», com data, resultado e resposta da Meta."
      />

      <SectionTitle first>Estado actual</SectionTitle>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="admin-card p-3">
          <div className="mini" style={{ color: "var(--muted)" }}>Nome público na Meta</div>
          <div><strong>{state?.verifiedName ?? "—"}</strong></div>
        </div>
        <div className="admin-card p-3">
          <div className="mini" style={{ color: "var(--muted)" }}>Estado da revisão</div>
          <div className="mono mini">{state?.nameStatus ?? "—"}</div>
        </div>
        <div className="admin-card p-3">
          <div className="mini" style={{ color: "var(--muted)" }}>Nome pretendido</div>
          <div><strong>{data?.target ?? "Afonso"}</strong></div>
        </div>
      </div>
      <div className="mt-3">
        <Button size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
          {sync.isPending ? "A verificar…" : "Verificar agora"}
        </Button>
        {sync.data ? (
          <span className="mini ml-3" style={{ color: "var(--muted)" }}>
            Resultado: {OUTCOME_LABEL[(sync.data as any).outcome]?.label ?? (sync.data as any).outcome}
            {(sync.data as any).error ? ` — ${(sync.data as any).error}` : ""}
          </span>
        ) : null}
      </div>
      <Source>Graph API do WhatsApp (leitura em direto)</Source>

      <SectionTitle>Histórico de tentativas</SectionTitle>
      {isLoading ? (
        <Empty>A carregar…</Empty>
      ) : attempts.length === 0 ? (
        <Empty note="A rotina corre de hora a hora; a primeira passagem aparece aqui logo a seguir.">
          Sem tentativas registadas ainda.
        </Empty>
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Data</th><th>Resultado</th><th>Nome nessa altura</th>
                <th>Estado Meta</th><th>Origem</th><th>Resposta da Meta</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((row) => {
                const outcome = outcomeOf(row);
                const info = OUTCOME_LABEL[outcome];
                const meta = row.metadata ?? {};
                const response = row.reason ?? (meta.meta_response ? JSON.stringify(meta.meta_response) : null);
                return (
                  <tr key={row.id}>
                    <td className="mini whitespace-nowrap">{new Date(row.created_at).toLocaleString("pt-PT")}</td>
                    <td><Badge tone={info?.tone ?? "warn"}>{info?.label ?? outcome}</Badge></td>
                    <td className="mini">{meta.current_name ?? meta.previous_name ?? "—"}</td>
                    <td className="mono mini">{meta.name_status ?? "—"}</td>
                    <td className="mono mini">{meta.source ?? "—"}</td>
                    <td className="mini" style={{ color: "var(--muted)", maxWidth: 380, wordBreak: "break-word" }}>
                      {response ?? "sem detalhe"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Source>admin_audit_logs (whatsapp.display_name.*)</Source>
    </div>
  );
}