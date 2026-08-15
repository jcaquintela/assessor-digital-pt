import { useEffect, useState } from "react";
import { completeOutlookMailConnect } from "@/lib/email/outlook/outlook.functions";
import { OUTLOOK_CONNECTOR_ID } from "@/lib/email/outlook/provider";

// Página de aterragem do popup de OAuth do Outlook (email). Só reencaminha o
// código de uso único para o servidor — nunca vê tokens nem chaves.
export function OutlookMailOAuthReturn() {
  const [message, setMessage] = useState("A concluir a ligação…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notify = (type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed") => {
      window.opener?.postMessage(
        { type, connectorId: OUTLOOK_CONNECTOR_ID, scope: "mail" },
        window.location.origin,
      );
      window.close();
    };

    if (params.get("success") !== "true") {
      setMessage(params.get("error") ?? "A autorização não foi concluída.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    const code = params.get("code");
    if (!code) {
      if (params.get("offline_access_allowed") === "false") {
        notify("appUserConnectorOAuthComplete");
        return;
      }
      setMessage("A autorização terminou sem código de troca.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    void completeOutlookMailConnect({ data: { code } })
      .then(() => notify("appUserConnectorOAuthComplete"))
      .catch(() => {
        setMessage("Não consegui concluir a ligação.");
        notify("appUserConnectorOAuthFailed");
      });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center p-8 text-center text-sm">
      {message}
    </div>
  );
}
