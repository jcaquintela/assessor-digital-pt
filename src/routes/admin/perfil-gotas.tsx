import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProfileDripMetrics } from "@/lib/admin/profile-drip-metrics.functions";

export const Route = createFileRoute("/admin/perfil-gotas")({
  component: PerfilGotasPage,
  head: () => ({
    meta: [
      { title: "Perfil por gotas · Admin" },
      {
        name: "description",
        content:
          "Quantos consultores estão elegíveis ao aviso de transição, quantos já o receberam e quantos responderam à pergunta de zona.",
      },
    ],
  }),
});

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function PerfilGotasPage() {
  const load = useServerFn(getProfileDripMetrics);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "perfil-gotas"],
    queryFn: () => load(),
  });

  const m = (data as any)?.metrics;
  const consultores = ((data as any)?.consultores ?? []) as any[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Perfil por gotas</h1>
        <p className="text-sm text-muted-foreground">
          Aviso de transição para consultores existentes e resposta à pergunta de zona de atuação.
        </p>
      </header>

      {isLoading ? <p className="text-sm text-muted-foreground">A carregar…</p> : null}
      {error ? (
        <p className="text-sm text-destructive">{(error as any)?.message ?? "Falhou a leitura."}</p>
      ) : null}

      {m ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card
              label="Elegíveis ao aviso"
              value={String(m.elegiveis)}
              hint={`de ${m.existentes} contas com mais de 7 dias`}
            />
            <Card
              label="Já receberam o aviso"
              value={String(m.receberam)}
              hint={`${m.total} consultores no total`}
            />
            <Card
              label="Pergunta de zona respondida"
              value={
                m.taxaResposta === null
                  ? "—"
                  : `${m.zonaRespondida}/${m.zonaPerguntada} (${m.taxaResposta}%)`
              }
              hint="respostas sobre perguntas feitas"
            />
            <Card
              label="Contexto de equipa"
              value={String(m.equipaRespondida)}
              hint={`${m.emPausa} em pausa por recusas`}
            />
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Consultor</th>
                  <th className="p-3">Conta desde</th>
                  <th className="p-3">Aviso</th>
                  <th className="p-3">Zona perguntada</th>
                  <th className="p-3">Zona</th>
                  <th className="p-3">Equipa</th>
                </tr>
              </thead>
              <tbody>
                {consultores.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="p-3">{c.nome || c.email || c.id.slice(0, 8)}</td>
                    <td className="p-3">{fmt(c.criadoEm)}</td>
                    <td className="p-3">{fmt(c.avisoEm)}</td>
                    <td className="p-3">{fmt(c.zonaPerguntadaEm)}</td>
                    <td className="p-3">{c.zona || "—"}</td>
                    <td className="p-3">{c.equipa || "—"}</td>
                  </tr>
                ))}
                {!consultores.length ? (
                  <tr>
                    <td className="p-3 text-muted-foreground" colSpan={6}>
                      Ainda sem consultores.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
