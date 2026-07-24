import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  listAdminUsers,
  suspendUser,
  reactivateUser,
  sendPasswordReset,
  inviteUser,
  grantRole,
  revokeRole,
  startUserDeletion,
  getMyAdminRole,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

export const Route = createFileRoute("/admin/utilizadores")({
  head: () => ({ meta: [{ title: "Admin — Utilizadores" }] }),
  component: UsersPage,
});

function UsersPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAdminUsers);
  const roleFn = useServerFn(getMyAdminRole);
  const { data: me } = useQuery({ queryKey: ["admin", "my-role"], queryFn: () => roleFn() });
  const { data: users, isLoading } = useQuery({ queryKey: ["admin", "users"], queryFn: () => list() });
  const [q, setQ] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const isSuper = me?.role === "super_admin";

  const suspend = useServerFn(suspendUser);
  const reactivate = useServerFn(reactivateUser);
  const reset = useServerFn(sendPasswordReset);
  const invite = useServerFn(inviteUser);
  const grant = useServerFn(grantRole);
  const revoke = useServerFn(revokeRole);
  const del = useServerFn(startUserDeletion);

  const wrap = (name: string, p: Promise<any>) =>
    p.then(() => { toast.success(name); qc.invalidateQueries({ queryKey: ["admin"] }); })
     .catch((e) => toast.error(e.message ?? name + " falhou"));

  const filtered = (users ?? []).filter((u) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (u.email ?? "").toLowerCase().includes(s) || (u.name ?? "").toLowerCase().includes(s);
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Utilizadores</h1>
        <p className="text-sm text-slate-500">
          Só administradores super_admin podem alterar planos, funções ou suspender contas.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Pesquisar por nome ou email…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <div className="ml-auto flex gap-2">
          <Input placeholder="email@exemplo.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="w-64" />
          <Button
            onClick={() => inviteEmail && wrap("Convite enviado", invite({ data: { email: inviteEmail } }).then(() => setInviteEmail("")))}
          >Convidar</Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800">
            <tr>
              <th className="px-3 py-2">Nome / Email</th>
              <th className="px-3 py-2">Função</th>
              <th className="px-3 py-2">Criado</th>
              <th className="px-3 py-2">Último acesso</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Uso 30d</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">A carregar…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Sem utilizadores.</td></tr>
            ) : filtered.map((u) => {
              const isSelf = me?.userId === u.id;
              return (
                <tr key={u.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2">
                    <div className="font-medium">{u.name || "—"}</div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </td>
                  <td className="px-3 py-2 capitalize">{u.role.replace("_", " ")}</td>
                  <td className="px-3 py-2 text-xs">{new Date(u.created_at).toLocaleDateString("pt-PT")}</td>
                  <td className="px-3 py-2 text-xs">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString("pt-PT") : "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={u.banned ? "text-red-600" : "text-green-600"}>{u.banned ? "Suspenso" : "Ativo"}</span>
                  </td>
                  <td className="px-3 py-2 text-xs">{u.monthly_usage}</td>
                  <td className="px-3 py-2 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => wrap("Email de recuperação enviado", reset({ data: { email: u.email } }))}>
                          Enviar recuperação de palavra-passe
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={!isSuper || isSelf || u.banned}
                          onClick={() => wrap("Utilizador suspenso", suspend({ data: { target_user_id: u.id } }))}
                        >Suspender</DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!isSuper || isSelf || !u.banned}
                          onClick={() => wrap("Utilizador reativado", reactivate({ data: { target_user_id: u.id } }))}
                        >Reativar</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={!isSuper || isSelf || u.role === "support_admin"}
                          onClick={() => wrap("Função atribuída", grant({ data: { target_user_id: u.id, role: "support_admin" } }))}
                        >Tornar support admin</DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!isSuper || isSelf || u.role === "super_admin"}
                          onClick={() => wrap("Função atribuída", grant({ data: { target_user_id: u.id, role: "super_admin" } }))}
                        >Tornar super admin</DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!isSuper || isSelf || u.role === "consultant"}
                          onClick={() => wrap("Função revogada", revoke({ data: { target_user_id: u.id, role: u.role as any } }))}
                        >Revogar função admin</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={!isSuper || isSelf}
                          onClick={() => confirm("Iniciar eliminação desta conta?") && wrap("Eliminação iniciada", del({ data: { target_user_id: u.id } }))}
                          className="text-red-600"
                        >Iniciar eliminação</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}