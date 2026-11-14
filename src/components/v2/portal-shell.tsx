import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { V2_POSITIONING } from "@/lib/v2/portal-scope";

/** Moldura do portal V2: sem menu comercial, só a conta. */
export function PortalShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link to="/conta" className="c-serif text-lg font-medium">Afonso</Link>
          <span className="text-xs text-muted-foreground">{V2_POSITIONING}</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="c-serif text-2xl font-medium md:text-[30px]">{title}</h1>
        {subtitle ? <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}
