import { createFileRoute, notFound } from "@tanstack/react-router";
import { ChannelChoice } from "@/components/canais/channel-choice";

/**
 * Harness de regressão visual (apenas em desenvolvimento/CI).
 * Renderiza a escolha de canal sem sessão nem dados, para que as imagens
 * de referência sejam determinísticas. Em produção devolve 404.
 */
export const Route = createFileRoute("/dev/ligar-canal")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({
    meta: [
      { title: "Harness · escolha de canal" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <div className="consult-root min-h-dvh px-4 py-10">
      <main className="mx-auto w-full max-w-3xl">
        <ChannelChoice onChoose={() => {}} />
      </main>
    </div>
  ),
});
