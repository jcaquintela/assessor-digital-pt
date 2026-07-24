import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAuditLogs } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/auditoria")({
  head: () => ({ meta: [{ title: "Auditoria — Admin" }] }),
  component: AuditoriaPage,
});

function AuditoriaPage() {
  const fn = useServerFn(listAuditLogs);
  const { data, isLoading } = useQuery({ queryKey: ["admin", "audit"], queryFn: () => fn() });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoria</h1>
        <p className="text-sm text-muted-foreground">Registo imutável de todas as ações administrativas.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Últimos 200 eventos</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-2">Data</th>
                  <th className="px-4 py-2">Ação</th>
                  <th className="px-4 py-2">Admin</th>
                  <th className="px-4 py-2">Alvo</th>
                  <th className="px-4 py-2">Recurso</th>
                  <th className="px-4 py-2">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (<tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">A carregar…</td></tr>)}
                {!isLoading && (data ?? []).length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Sem eventos registados.</td></tr>
                )}
                {(data ?? []).map((row: any) => (
                  <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2 whitespace-nowrap text-xs">{new Date(row.created_at).toLocaleString("pt-PT")}</td>
                    <td className="px-4 py-2 font-medium">{row.action}</td>
                    <td className="px-4 py-2 font-mono text-xs">{row.admin_user_id?.slice(0, 8)}…</td>
                    <td className="px-4 py-2 font-mono text-xs">{row.target_user_id ? `${row.target_user_id.slice(0, 8)}…` : "—"}</td>
                    <td className="px-4 py-2 text-xs">{row.resource_type ? `${row.resource_type}${row.resource_id ? ":" + row.resource_id : ""}` : "—"}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{row.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}