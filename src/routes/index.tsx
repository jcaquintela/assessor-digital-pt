import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  useEffect(() => {
    // Antes de hidratação, useIsMobile devolve false; esperamos por matchMedia.
    if (typeof window === "undefined") return;
    const target = window.matchMedia("(max-width: 767px)").matches ? "/assessor" : "/hoje";
    navigate({ to: target, replace: true });
  }, [isMobile, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      <p className="text-sm">A abrir Assessor do Consultor…</p>
    </div>
  );
}
