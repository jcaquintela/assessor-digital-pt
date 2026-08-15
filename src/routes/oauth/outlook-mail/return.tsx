import { createFileRoute } from "@tanstack/react-router";
import { OutlookMailOAuthReturn } from "@/components/email/outlook-mail-oauth-return";

export const Route = createFileRoute("/oauth/outlook-mail/return")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Ligar Outlook (email) — Afonso" },
      { name: "description", content: "A concluir a ligação à tua caixa de correio do Outlook." },
      { property: "og:title", content: "Ligar Outlook (email) — Afonso" },
      { property: "og:description", content: "A concluir a ligação à tua caixa de correio do Outlook." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OutlookMailOAuthReturn,
});
