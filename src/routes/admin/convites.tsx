import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  createTelegramInvite,
  listTelegramInvites,
  revokeTelegramInvite,
} from "@/lib/telegram/invites.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/convites")({
  component: ConvitesPage,
});

function ConvitesPage() {
  const list = useServerFn(listTelegramInvites);
  const create = useServerFn(createTelegramInvite);
  const revoke = useServerFn(revokeTelegramInvite);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["admin", "tg-invites"], queryFn: () => list() });
  const [note, setNote] = useState("");
  const [ttl, setTtl] = useState(30);

  const createMut = useMutation({
    mutationFn: () => create({ data: { note: note.trim() || undefined, ttlDays: ttl, subscriptionTier: "base" } }),
    onSuccess: (r: any) => {
      toast.success(`Convite criado: ${r.code}`);
      setNote("");
      qc.invalidateQueries({ queryKey: ["admin", "tg-invites"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falhou"),
  });

  const revokeMut = useMutation({
    mutationFn: (code: string) => revoke({ data: { code } }),
    onSuccess: () => {
      toast.success("Convite revogado");
      qc.invalidateQueries({ queryKey: ["admin", "tg-invites"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falhou"),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Convites Telegram</h1>
        <p className="text-sm text-muted-foreground">
          Códigos usados uma vez para ligar contas do Nível 0 via bot Telegram. Partilha o código com o consultor; ele
          envia <code>/start CODIGO</code> ao bot.
        </p>
      </header>

      <div className="rounded-lg border bg-white p-4 dark:bg-slate-900 dark:border-slate-800">
        <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto] sm:items-end">
          <div>
            <Label htmlFor="note">Nota (opcional)</Label>
            <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: Piloto — João" />
          </div>
          <div>
            <Label htmlFor="ttl">Validade (dias)</Label>
            <Input id="ttl" type="number" min={1} max={365} value={ttl} onChange={(e) => setTtl(Number(e.target.value) || 30)} />
          </div>
          <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
            {createMut.isPending ? "A criar…" : "Criar convite"}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-white dark:bg-slate-900 dark:border-slate-800">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">A carregar…</div>
        ) : !data?.invites?.length ? (
          <div className="p-6 text-sm text-muted-foreground">Ainda não há convites.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-950 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2">Código</th>
                <th className="px-4 py-2">Nota</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Expira</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.invites.map((inv: any) => {
                const used = !!inv.used_by;
                const expired = !used && inv.expires_at && new Date(inv.expires_at).getTime() < Date.now();
                const state = used ? "Resgatado" : expired ? "Expirado" : "Ativo";
                return (
                  <tr key={inv.code} className="border-b last:border-0 dark:border-slate-800">
                    <td className="px-4 py-2 font-mono">{inv.code}</td>
                    <td className="px-4 py-2 text-muted-foreground">{inv.note ?? "—"}</td>
                    <td className="px-4 py-2">{state}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {inv.expires_at ? new Date(inv.expires_at).toLocaleString("pt-PT") : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {!used && (
                        <Button size="sm" variant="outline" onClick={() => revokeMut.mutate(inv.code)}>
                          Revogar
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
