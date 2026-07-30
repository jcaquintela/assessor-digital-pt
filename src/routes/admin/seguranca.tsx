import { createFileRoute, redirect } from "@tanstack/react-router";

// Página absorvida na consolidação do grupo "Sistema".
// Mantida como redirect para não partir URLs guardados.
export const Route = createFileRoute("/admin/seguranca")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/auditoria-seguranca", replace: true });
  },
});
