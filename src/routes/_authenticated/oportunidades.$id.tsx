// Rota antiga: /oportunidades/<id> foi renomeada para /negocios/<id>.
// Mantida apenas para não partir links já partilhados ou guardados.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/oportunidades/$id")({
  validateSearch: (search: Record<string, unknown>): { destaque?: string } => ({
    destaque: typeof search.destaque === "string" ? search.destaque : undefined,
  }),
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/negocios/$id",
      params: { id: params.id },
      search: search.destaque ? { destaque: search.destaque } : {},
      replace: true,
    });
  },
});