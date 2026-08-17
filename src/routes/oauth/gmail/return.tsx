import { appTitle } from "@/lib/brand";
import { createFileRoute } from "@tanstack/react-router";
import { GmailOAuthReturn } from "@/components/email/gmail-oauth-return";

export const Route = createFileRoute("/oauth/gmail/return")({
  ssr: false,
  head: () => ({
    meta: [
      { title: appTitle("Ligar Gmail") },
      { name: "description", content: "A concluir a ligação à tua conta Gmail." },
      { property: "og:title", content: appTitle("Ligar Gmail") },
      { property: "og:description", content: "A concluir a ligação à tua conta Gmail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GmailOAuthReturn,
});
