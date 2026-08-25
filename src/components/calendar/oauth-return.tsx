import { useCallback } from "react";
import { completeCalendarConnect, syncCalendarNow } from "@/lib/calendar/calendar.functions";
import { CALENDAR_PROVIDER_LABEL, type CalendarProvider } from "@/lib/calendar/providers";
import { ConnectorOAuthReturn } from "@/components/oauth/connector-return";

export function CalendarOAuthReturn({ provider }: { provider: CalendarProvider }) {
  const complete = useCallback(
    (code: string) => completeCalendarConnect({ data: { code } }),
    [],
  );
  // A primeira sincronização corre em segundo plano: nunca prende esta página.
  const onDone = useCallback(() => { void syncCalendarNow().catch(() => {}); }, []);

  return (
    <ConnectorOAuthReturn
      connectorId={provider}
      label={CALENDAR_PROVIDER_LABEL[provider]}
      complete={complete}
      onDone={onDone}
    />
  );
}
