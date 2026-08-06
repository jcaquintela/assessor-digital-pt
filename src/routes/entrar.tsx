import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { redeemLoginLink, requestNewLoginLink } from "@/lib/auth/login-link.functions";
import { getPasswordSetupState } from "@/lib/auth/password-setup.functions";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/entrar")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar sem palavra-passe — Afonso" },
      { name: "description", content: "Abre o painel com o link temporário que o Afonso te enviou." },
      { property: "og:title", content: "Entrar sem palavra-passe — Afonso" },
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
  const [token, setToken] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [askMsg, setAskMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const raw = new URLSearchParams(window.location.search).get("token");
      const wantsPassword = new URLSearchParams(window.location.search).get("pw") === "1";
      const token = (raw ?? "").trim().replace(/[>"')\].,;:!?]+$/, "");
      setToken(token || null);
      if (!token) {
        setFailed(true);
        setMsg("Este link não está completo. Pede um novo ao Afonso.");
        return;
      }
      try {
        const r = await redeemLoginLink({ data: { token } });
        if (!r.ok) {
          setFailed(true);
          setMsg("Este link já não é válido — foi usado ou passaram mais de 15 minutos.");
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
        // Link de recuperação: vai direto ao ecrã da nova palavra-passe.
        if (wantsPassword) {
          navigate({ to: "/definir-password", replace: true });
          return;
        }
        // Passo opcional: só a quem ainda não tem palavra-passe nem disse
        // "agora não". Nunca bloqueia a entrada no painel.
        try {
          const state = await getPasswordSetupState();
          if (state.shouldOffer) {
            navigate({ to: "/definir-password", replace: true });
            return;
          }
        } catch {
          // Ignora: a entrada no painel é mais importante que o passo opcional.
        }
        navigate({ to: "/", replace: true });
      } catch {
        setFailed(true);
        setMsg("Não consegui abrir a sessão. Pede um novo link ao Afonso.");
      }
    })();
  }, [navigate]);

  async function pedirNovo() {
    if (!token) return;
    setAsking(true);
    setAskMsg(null);
    try {
      const r = await requestNewLoginLink({ data: { token } });
      if (r.ok) {
        setAskMsg(
          `Enviei-te um link novo por ${r.channel === "telegram" ? "Telegram" : "WhatsApp"}. Abre a conversa com o Afonso.`,
        );
      } else if (r.reason === "too_soon") {
        setAskMsg("Já te enviei um link há segundos — vê a conversa com o Afonso.");
      } else {
        setAskMsg("Não consegui enviar. Escreve *entrar* ao Afonso na tua conversa.");
      }
    } catch {
      setAskMsg("Não consegui enviar. Escreve *entrar* ao Afonso na tua conversa.");
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-sm text-center">
        <div className="mb-6 flex items-center justify-center gap-2">
          <BrandMark size={36} />
          <div className="text-left">
            <div className="text-sm font-semibold leading-tight">Afonso</div>
            <div className="text-xs text-muted-foreground">o teu assessor</div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{msg}</p>
        {failed && (
          <div className="mt-5 space-y-3">
            {token && (
              <Button onClick={pedirNovo} disabled={asking} className="w-full">
                {asking ? "A enviar…" : "Pedir novo link"}
              </Button>
            )}
            {askMsg && <p className="text-xs text-muted-foreground">{askMsg}</p>}
            <p className="text-xs text-muted-foreground">
              <Link to="/auth" className="underline">Entrar com email e palavra-passe</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}