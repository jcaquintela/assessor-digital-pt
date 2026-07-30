import { createFileRoute, redirect } from "@tanstack/react-router";

// Página absorvida na consolidação do grupo "Sistema".
// Mantida como redirect para não partir URLs guardados.
export const Route = createFileRoute("/admin/integracoes")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/integracoes-flags", replace: true });
  },
});
