import { createFileRoute } from "@tanstack/react-router";
import { CalendarOAuthReturn } from "@/components/calendar/oauth-return";

export const Route = createFileRoute("/oauth/outlook/return")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Ligar Microsoft Outlook — Assessor do Consultor" },
      { name: "description", content: "A concluir a ligação ao Microsoft Outlook." },
      { property: "og:title", content: "Ligar Microsoft Outlook — Assessor do Consultor" },
      { property: "og:description", content: "A concluir a ligação ao Microsoft Outlook." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <CalendarOAuthReturn provider="microsoft_outlook" />,
});