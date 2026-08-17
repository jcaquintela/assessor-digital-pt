import { appTitle } from "@/lib/brand";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarOAuthReturn } from "@/components/calendar/oauth-return";

export const Route = createFileRoute("/oauth/outlook/return")({
  ssr: false,
  head: () => ({
    meta: [
      { title: appTitle("Ligar Microsoft Outlook") },
      { name: "description", content: "A concluir a ligação ao Microsoft Outlook." },
      { property: "og:title", content: appTitle("Ligar Microsoft Outlook") },
      { property: "og:description", content: "A concluir a ligação ao Microsoft Outlook." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <CalendarOAuthReturn provider="microsoft_outlook" />,
});