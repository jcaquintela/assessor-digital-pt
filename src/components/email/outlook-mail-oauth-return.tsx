import { useCallback } from "react";
import { completeOutlookMailConnect } from "@/lib/email/outlook/outlook.functions";
import { OUTLOOK_CONNECTOR_ID } from "@/lib/email/outlook/provider";
import { ConnectorOAuthReturn } from "@/components/oauth/connector-return";

export function OutlookMailOAuthReturn() {
  const complete = useCallback(
    (code: string) => completeOutlookMailConnect({ data: { code } }),
    [],
  );
  return (
    <ConnectorOAuthReturn connectorId={OUTLOOK_CONNECTOR_ID} label="Outlook" complete={complete} />
  );
}
