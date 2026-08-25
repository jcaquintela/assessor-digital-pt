import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  readOAuthReturn,
  REDIRECT_DELAY_MS,
  SELF_CLOSE_GRACE_MS,
  SLOW_HINT_MS,
} from "./return-state";

type Notify = "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed";

/**
 * Página de aterragem do consentimento. Só reencaminha o código de uso único
 * para o servidor — nunca vê tokens nem a chave de ligação.
 *
 * Regra de ouro desta página: nunca ficar em "a validar" para sempre. Se foi
 * aberta em pop-up, avisa o Afonso e fecha-se; se não tem `opener` (mesma aba,
 * ou o browser cortou a ligação), mostra confirmação e volta sozinha.
 */
export function ConnectorOAuthReturn({
  connectorId,
  label,
  complete,
  backTo = "/ligar-canal",
  onDone,
}: {
  connectorId: string;
  label: string;
  complete: (code: string) => Promise<unknown>;
  backTo?: string;
  onDone?: () => void;
}) {
  const [phase, setPhase] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("A concluir a ligação…");
  const [slow, setSlow] = useState(false);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    let alive = true;
    const notify = (type: Notify) => {
      try {
        window.opener?.postMessage({ type, connectorId }, window.location.origin);
      } catch { /* sem opener: seguimos com o ecrã de confirmação */ }
      try { window.close(); } catch { /* o browser pode recusar */ }
      // Se ainda cá estamos, a janela não fecha sozinha: assumimos o comando.
      window.setTimeout(() => { if (alive) setStuck(true); }, SELF_CLOSE_GRACE_MS);
    };

    const slowTimer = window.setTimeout(() => { if (alive) setSlow(true); }, SLOW_HINT_MS);

    const action = readOAuthReturn(window.location.search);
    if (action.kind === "error") {
      setPhase("error");
      setMessage(action.message);
      notify("appUserConnectorOAuthFailed");
      window.clearTimeout(slowTimer);
      return () => { alive = false; };
    }
    if (action.kind === "done") {
      setPhase("done");
      setMessage(`${label} ligado.`);
      onDone?.();
      notify("appUserConnectorOAuthComplete");
      window.clearTimeout(slowTimer);
      return () => { alive = false; };
    }

    void complete(action.code)
      .then(() => {
        if (!alive) return;
        window.clearTimeout(slowTimer);
        setPhase("done");
        setMessage(`${label} ligado.`);
        onDone?.();
        notify("appUserConnectorOAuthComplete");
      })
      .catch(() => {
        if (!alive) return;
        window.clearTimeout(slowTimer);
        setPhase("error");
        setMessage("Não consegui concluir a ligação.");
        notify("appUserConnectorOAuthFailed");
      });

    return () => { alive = false; window.clearTimeout(slowTimer); };
  }, [connectorId, label, complete, onDone]);

  // Sem opener: volta sozinha ao Afonso pouco depois da confirmação.
  useEffect(() => {
    if (!stuck || phase !== "done") return;
    const t = window.setTimeout(() => { window.location.replace(backTo); }, REDIRECT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [stuck, phase, backTo]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center text-sm">
      <p data-testid="oauth-return-message" className="max-w-sm">{message}</p>
      {phase === "working" && slow && (
        <p className="max-w-sm text-xs text-muted-foreground">
          Está a demorar mais do que o normal. A ligação continua a ser concluída — podes voltar ao
          Afonso e ver o estado nas Definições.
        </p>
      )}
      {phase === "done" && stuck && (
        <p className="text-xs text-muted-foreground">A voltar ao Afonso…</p>
      )}
      {(phase !== "working" || slow) && (
        <Link
          to={backTo}
          data-testid="oauth-return-back"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Voltar ao Afonso
        </Link>
      )}
    </div>
  );
}
