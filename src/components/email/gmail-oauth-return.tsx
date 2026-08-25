import { useCallback } from "react";
import { completeGmailConnect } from "@/lib/email/gmail/gmail.functions";
import { GMAIL_CONNECTOR_ID } from "@/lib/email/gmail/provider";
import { ConnectorOAuthReturn } from "@/components/oauth/connector-return";

export function GmailOAuthReturn() {
  const complete = useCallback(
    (code: string) => completeGmailConnect({ data: { code } }),
    [],
  );
  return (
    <ConnectorOAuthReturn connectorId={GMAIL_CONNECTOR_ID} label="Gmail" complete={complete} />
  );
}
