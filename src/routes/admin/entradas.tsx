import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  listLoginLinkStatus,
  resendLoginLink,
  type LoginLinkConsultant,
  type LoginLinkRow,
} from "@/lib/admin/login-links.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InvitePreview } from "@/components/admin/invite-preview";

export const Route = createFileRoute("/admin/entradas")({
  component: EntradasPage,
});

const dt = (v: string | null) => (v ? new Date(v).toLocaleString("pt-PT") : "—");

const ESTADO_LABEL: Record<LoginLinkRow["estado"], string> = {
  ativo: "Válido",
  usado: "Usado",
  expirado: "Expirado",
  substituido: "Substituído por um link mais recente",
};

function EstadoBadge({ estado }: { estado: LoginLinkRow["estado"] }) {
  const cls =
    estado === "ativo"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
      : estado === "usado"
        ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
        : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  return <span className={`rounded px-2 py-0.5 text-xs ${cls}`}>{ESTADO_LABEL[estado]}</span>;
}

function EntradasPage() {
  const list = useServerFn(listLoginLinkStatus);
  const resend = useServerFn(resendLoginLink);
  const queryClient = useQueryClient();
  const [termo, setTermo] = useState("");
  const [filtro, setFiltro] = useState({ query: "", apenasBeta: true });
  const [aberto, setAberto] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [canal, setCanal] = useState<"whatsapp" | "telegram">("whatsapp");

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin", "login-links", filtro],
    queryFn: () => list({ data: filtro }),
  });

  const reenviar = useMutation({
    mutationFn: (vars: { userId: string; motivo: string; canal: "whatsapp" | "telegram" }) =>
      resend({ data: vars }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(`Link novo enviado por ${res.canal}.`);
        setAberto(null);
        setMotivo("");
        queryClient.invalidateQueries({ queryKey: ["admin", "login-links"] });
      } else {
        toast.error(res.erro);
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível reenviar o link."),
  });

  const consultores = (data?.consultores ?? []) as LoginLinkConsultant[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Entradas no painel</h1>
        <p className="text-sm text-muted-foreground">
          Estado dos links de entrada enviados por WhatsApp, Telegram ou painel: quando foram emitidos, se já foram
          usados, quando expiram e quantas vezes foram reenviados. Só leitura — o link nunca é mostrado por inteiro.
        </p>
      </header>

      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-4 dark:bg-slate-900 dark:border-slate-800"
        onSubmit={(e) => {
          e.preventDefault();
          setFiltro((f) => ({ ...f, query: termo.trim() }));
        }}
      >
        <div className="min-w-[240px] flex-1">
          <Label htmlFor="q">Procurar consultor</Label>
          <Input
            id="q"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Nome, email ou telemóvel"
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={filtro.apenasBeta}
            onChange={(e) => setFiltro((f) => ({ ...f, apenasBeta: e.target.checked }))}
          />
          Só beta testers
        </label>
        <Button type="submit" disabled={isFetching}>
          {isFetching ? "A procurar…" : "Procurar"}
        </Button>
      </form>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : !consultores.length ? (
        <p className="text-sm text-muted-foreground">Nenhum consultor encontrado com estes filtros.</p>
      ) : (
        <div className="space-y-4">
          {consultores.map((c) => (
            <section key={c.id} className="rounded-lg border bg-white dark:bg-slate-900 dark:border-slate-800">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3 dark:border-slate-800">
                <div>
                  <h2 className="font-medium">
                    {c.nome ?? "Sem nome"}
                    {c.betaTester && (
                      <span className="ml-2 rounded bg-violet-100 px-2 py-0.5 text-xs text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                        beta
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {c.email ?? "sem email"} · {c.telefone ?? "sem telemóvel"}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {c.totalEmitidos} link(s) · {c.reenvios} reenvio(s) · último {dt(c.ultimoEmitido)}
                </p>
                <Button
                  size="sm"
                  variant={aberto === c.id ? "secondary" : "default"}
                  onClick={() => {
                    setAberto(aberto === c.id ? null : c.id);
                    setMotivo("");
                  }}
                >
                  {aberto === c.id ? "Cancelar" : "Reenviar link"}
                </Button>
              </div>

              {aberto === c.id && (
                <form
                  className="flex flex-wrap items-end gap-3 border-b bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (motivo.trim().length < 3) {
                      toast.error("Escreve o motivo do reenvio.");
                      return;
                    }
                    reenviar.mutate({ userId: c.id, motivo: motivo.trim(), canal });
                  }}
                >
                  <div className="min-w-[260px] flex-1">
                    <Label htmlFor={`motivo-${c.id}`}>Motivo do reenvio</Label>
                    <Input
                      id={`motivo-${c.id}`}
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Ex.: link expirou antes de o consultor clicar"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`canal-${c.id}`}>Canal</Label>
                    <select
                      id={`canal-${c.id}`}
                      className="h-10 rounded-md border bg-background px-3 text-sm dark:border-slate-800"
                      value={canal}
                      onChange={(e) => setCanal(e.target.value as "whatsapp" | "telegram")}
                    >
                      <option value="whatsapp">WhatsApp</option>
                      <option value="telegram">Telegram</option>
                    </select>
                  </div>
                  <Button type="submit" disabled={reenviar.isPending}>
                    {reenviar.isPending ? "A enviar…" : "Enviar link novo"}
                  </Button>
                  <div className="w-full">
                    <InvitePreview canal={canal} nome={c.nome} phone={c.telefone} />
                  </div>
                  <p className="w-full text-xs text-muted-foreground">
                    O link novo invalida os anteriores por usar. O motivo fica registado no histórico.
                  </p>
                </form>
              )}

              {!c.links.length ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">Ainda não foi emitido nenhum link a este consultor.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-950 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-2">Emitido</th>
                      <th className="px-4 py-2">Canal</th>
                      <th className="px-4 py-2">Estado</th>
                      <th className="px-4 py-2">Usado</th>
                      <th className="px-4 py-2">Expira</th>
                      <th className="px-4 py-2">Motivo do reenvio</th>
                      <th className="px-4 py-2">Ref.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.links.map((l) => (
                      <tr key={l.tokenPrefix + l.createdAt} className="border-b last:border-0 dark:border-slate-800">
                        <td className="px-4 py-2">{dt(l.createdAt)}</td>
                        <td className="px-4 py-2 capitalize">{l.channel}</td>
                        <td className="px-4 py-2">
                          <EstadoBadge estado={l.estado} />
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{dt(l.usedAt)}</td>
                        <td className="px-4 py-2 text-muted-foreground">{dt(l.expiresAt)}</td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {l.motivo ?? "—"}
                          {l.emitidoPorEquipa && (
                            <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                              equipa
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{l.tokenPrefix}…</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
