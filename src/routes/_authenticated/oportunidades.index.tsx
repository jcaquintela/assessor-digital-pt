// A antiga lista de oportunidades passou a ser o Quadro de Negócios.
// Mantemos a rota para não partir ligações antigas.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/oportunidades/")({
  beforeLoad: () => {
    throw redirect({ to: "/negocios" });
  },
});
