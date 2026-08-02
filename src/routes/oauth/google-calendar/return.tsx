import { createFileRoute } from "@tanstack/react-router";
import { CalendarOAuthReturn } from "@/components/calendar/oauth-return";

export const Route = createFileRoute("/oauth/google-calendar/return")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Ligar Google Calendar — Afonso" },
      { name: "description", content: "A concluir a ligação ao Google Calendar." },
      { property: "og:title", content: "Ligar Google Calendar — Afonso" },
      { property: "og:description", content: "A concluir a ligação ao Google Calendar." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <CalendarOAuthReturn provider="google_calendar" />,
});