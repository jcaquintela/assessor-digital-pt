import { createFileRoute } from "@tanstack/react-router";
import { OutlookMailOAuthReturn } from "@/components/email/outlook-mail-oauth-return";
import { appTitle } from "@/lib/brand";

export const Route = createFileRoute("/oauth/outlook-mail/return")({
  ssr: false,
  head: () => ({
    meta: [
      { title: appTitle("Ligar Outlook (email)") },
      { name: "description", content: "A concluir a ligação à tua caixa de correio do Outlook." },
      { property: "og:title", content: appTitle("Ligar Outlook (email)") },
      { property: "og:description", content: "A concluir a ligação à tua caixa de correio do Outlook." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OutlookMailOAuthReturn,
});
