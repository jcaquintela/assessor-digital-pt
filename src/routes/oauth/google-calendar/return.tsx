import { createFileRoute } from "@tanstack/react-router";
import { CalendarOAuthReturn } from "@/components/calendar/oauth-return";
import { appTitle } from "@/lib/brand";

export const Route = createFileRoute("/oauth/google-calendar/return")({
  ssr: false,
  head: () => ({
    meta: [
      { title: appTitle("Ligar Google Calendar") },
      { name: "description", content: "A concluir a ligação ao Google Calendar." },
      { property: "og:title", content: appTitle("Ligar Google Calendar") },
      { property: "og:description", content: "A concluir a ligação ao Google Calendar." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <CalendarOAuthReturn provider="google_calendar" />,
});