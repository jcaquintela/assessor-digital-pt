import { createFileRoute } from "@tanstack/react-router";
import { GmailOAuthReturn } from "@/components/email/gmail-oauth-return";

export const Route = createFileRoute("/oauth/gmail/return")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Ligar Gmail — Afonso" },
      { name: "description", content: "A concluir a ligação à tua conta Gmail." },
      { property: "og:title", content: "Ligar Gmail — Afonso" },
      { property: "og:description", content: "A concluir a ligação à tua conta Gmail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GmailOAuthReturn,
});
