import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PageTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h1>{title}</h1>
      <p className="sub">{sub}</p>
    </div>
  );
}

export function SectionTitle({ children, first }: { children: ReactNode; first?: boolean }) {
  return <div className="sectiontitle" style={first ? { marginTop: 0 } : undefined}>{children}</div>;
}

// Etiqueta obrigatória de proveniência do número.
export function Source({ children, stale }: { children: ReactNode; stale?: boolean }) {
  return (
    <div className={cn("source", stale && "stale")}>
      <span className="sdot" />
      fonte: {children}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  sub,
  source,
  stale,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub: string;
  source: string;
  stale?: boolean;
  tone?: "muted" | "coral" | "default";
}) {
  const color =
    tone === "muted" ? "var(--muted)" : tone === "coral" ? "var(--coral)" : "var(--ink)";
  return (
    <Card className="admin-card gap-0 border-0 p-5 shadow-none">
      <CardHeader className="mb-0 gap-0 p-0">
        <CardTitle asChild>
          <h3>{label}</h3>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="metric" style={{ color }}>{value}</div>
        <div className="metric-sub">{sub}</div>
        <Source stale={stale}>{source}</Source>
      </CardContent>
    </Card>
  );
}

export function Badge({ tone, children }: { tone: "ok" | "warn" | "bad"; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Empty({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="empty">
      {children}
      {note ? (
        <>
          <br />
          <span className="mini" style={{ color: "var(--muted)" }}>{note}</span>
        </>
      ) : null}
    </div>
  );
}

export function Grid({ cols, children }: { cols: 3 | 4; children: ReactNode }) {
  return (
    <div className={cn("grid gap-3.5", cols === 4 ? "md:grid-cols-4" : "md:grid-cols-3", "grid-cols-1 sm:grid-cols-2")}>
      {children}
    </div>
  );
}
