import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { redeemLoginLink } from "@/lib/auth/login-link.functions";

export const Route = createFileRoute("/entrar")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar sem palavra-passe — Assessor do Consultor" },
      { name: "description", content: "Abre o painel com o link temporário que o Afonso te enviou." },
      { property: "og:title", content: "Entrar sem palavra-passe — Assessor do Consultor" },
      { property: "og:description", content: "Abre o painel com o link temporário que o Afonso te enviou." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EntrarPage,
});

function EntrarPage() {
  const navigate = useNavigate();
  const [msg, setMsg] = useState("A abrir a tua conta…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    (async () => {
      const token = new URLSearchParams(window.location.search).get("token");
      if (!token) {
        setFailed(true);
        setMsg("Este link não está completo. Pede um novo ao Afonso.");
        return;
      }
      try {
        const r = await redeemLoginLink({ data: { token } });
        if (!r.ok) {
          setFailed(true);
          setMsg("Este link já não é válido. Escreve entrar ao Afonso para receberes um novo.");
          return;
        }
        const { error } = await supabase.auth.verifyOtp({
          type: "magiclink",
          token_hash: r.tokenHash,
        });
        if (error) {
          setFailed(true);
          setMsg("Não consegui abrir a sessão. Pede um novo link ao Afonso.");
          return;
        }
        navigate({ to: "/", replace: true });
      } catch {
        setFailed(true);
        setMsg("Não consegui abrir a sessão. Pede um novo link ao Afonso.");
      }
    })();
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-sm text-center">
        <p className="text-sm text-muted-foreground">{msg}</p>
        {failed && (
          <p className="mt-4 text-xs text-muted-foreground">
            <Link to="/auth" className="underline">Voltar ao início de sessão</Link>
          </p>
        )}
      </div>
    </div>
  );
}