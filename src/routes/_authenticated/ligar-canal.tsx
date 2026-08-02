import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { createTelegramLinkToken, getTelegramLink } from "@/lib/telegram/link.functions";

export const Route = createFileRoute("/_authenticated/ligar-canal")({
  head: () => ({
    meta: [
      { title: "Ligar o teu canal — Afonso" },
      { name: "description", content: "Liga o Telegram à tua conta para começares a falar com o Afonso." },
      { property: "og:title", content: "Ligar o teu canal — Afonso" },
      { property: "og:description", content: "Liga o Telegram à tua conta para começares a falar com o Afonso." },
    ],
  }),
  component: LigarCanalPage,
});

function LigarCanalPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fetchStatus = useServerFn(getTelegramLink);
  const createToken = useServerFn(createTelegramLinkToken);

  const { data, isLoading } = useQuery({
    queryKey: ["telegram", "link"],
    queryFn: () => fetchStatus(),
    refetchInterval: (q) => ((q.state.data as { linked?: boolean } | undefined)?.linked ? false : 4000),
  });

  const link = useMutation({
    mutationFn: async () => createToken(),
    onSuccess: (r) => {
      window.open(r.url, "_blank", "noopener,noreferrer");
      toast.success("Abre o Telegram e carrega em Iniciar — ligo à tua conta automaticamente.");
      qc.invalidateQueries({ queryKey: ["telegram", "link"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="consult-root min-h-screen px-4 py-10">
      <main className="mx-auto w-full max-w-xl">
        <p className="c-eyebrow">Último passo</p>
        <h1 className="c-page-title mt-1">Liga o teu canal</h1>
        <p className="c-muted mt-2 text-[14px] leading-relaxed">
          A conta está criada no plano Base. Para falares comigo no dia-a-dia, liga o
          Telegram — é por aí que te respondo, te lembro do que interessa e guardo tudo.
        </p>

        <section className="c-card mt-6 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="c-section-title">Telegram</h2>
            <span className={data?.linked ? "c-badge ok" : "c-badge"}>
              {data?.linked ? "Ligado" : "Não ligado"}
            </span>
          </div>
          {isLoading ? (
            <p className="c-muted text-sm">A carregar…</p>
          ) : data?.linked ? (
            <>
              <p className="text-[13px]">
                Está ligado{data.displayName ? ` (${data.displayName})` : ""}. Já podes falar comigo.
              </p>
              <div className="mt-3">
                <button className="c-cta" onClick={() => navigate({ to: "/", replace: true })}>
                  Entrar no painel
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[13px]">
                O botão abre o Afonso no Telegram já identificado — carrega em Iniciar e
                esta página actualiza sozinha.
              </p>
              <div className="mt-3">
                <button className="c-cta" onClick={() => link.mutate()} disabled={link.isPending}>
                  <ExternalLink className="h-3.5 w-3.5" /> Ligar Telegram
                </button>
              </div>
              <p className="c-muted mt-2 text-[12px]">
                A ligação é válida durante 15 minutos e só pode ser usada uma vez.
              </p>
            </>
          )}
        </section>

        <p className="c-muted mt-6 text-[13px]">
          Preferes ver primeiro o painel? <Link to="/hoje" className="underline">Continuar sem ligar</Link>
        </p>
      </main>
    </div>
  );
}