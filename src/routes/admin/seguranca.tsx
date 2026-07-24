import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMfaRequired } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/seguranca")({
  head: () => ({ meta: [{ title: "Segurança — Admin" }] }),
  component: SecurityPage,
});

function SecurityPage() {
  const fn = useServerFn(listMfaRequired);
  const { data } = useQuery({ queryKey: ["admin", "mfa"], queryFn: () => fn() });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Segurança</h1>
        <p className="text-sm text-muted-foreground">Obrigatoriedade de MFA e acesso de suporte temporário.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">MFA obrigatório</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Utilizadores marcados como obrigados a MFA. A imposição no fluxo de login deve ser ligada quando o Supabase MFA for ativado.
          </p>
          <ul className="text-sm space-y-1">
            {(data ?? []).length === 0 && <li className="text-muted-foreground">Nenhum utilizador marcado.</li>}
            {(data ?? []).map((r: any) => (
              <li key={r.user_id} className="font-mono text-xs">{r.user_id}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Acesso de suporte temporário</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Em preparação. Por defeito, administradores não podem ver conversas, contactos, oportunidades, despesas, comissões ou documentos dos consultores.
          O acesso de suporte terá de ser autorizado pelo próprio utilizador, com motivo, duração e registo em auditoria.
        </CardContent>
      </Card>
    </div>
  );
}