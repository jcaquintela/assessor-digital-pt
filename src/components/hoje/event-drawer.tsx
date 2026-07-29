import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { formatDataHora } from "@/lib/demo-data";
import { CalendarClock, User, Building2, ExternalLink } from "lucide-react";

export interface EventDrawerItem {
  id: string;
  titulo: string;
  data: string;
  hora?: string;
  pessoaNome?: string | null;
  pessoaId?: string | null;
  imovelTitulo?: string | null;
  imovelId?: string | null;
  notas?: string | null;
  estado?: string;
}

export function EventDrawer({ item, onClose }: { item: EventDrawerItem | null; onClose: () => void }) {
  return (
    <Sheet open={!!item} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-md">
        {item && (
          <>
            <SheetHeader>
              <SheetTitle className="text-left">{item.titulo}</SheetTitle>
              <SheetDescription className="flex items-center gap-1.5 text-left">
                <CalendarClock className="h-3.5 w-3.5" /> {formatDataHora(item.data)}{item.hora ? ` · ${item.hora}` : ""}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6 space-y-4 text-sm">
              {item.pessoaId && (
                <Link to="/pessoas/$id" params={{ id: item.pessoaId }} className="flex items-center gap-2 rounded-lg border border-border p-3 hover:bg-muted">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">{item.pessoaNome ?? "Pessoa"}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </Link>
              )}
              {item.imovelId && (
                <Link to="/imoveis/$id" params={{ id: item.imovelId }} className="flex items-center gap-2 rounded-lg border border-border p-3 hover:bg-muted">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">{item.imovelTitulo ?? "Imóvel"}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </Link>
              )}
              {item.notas && (
                <div className="rounded-lg border border-border p-3">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">Notas</div>
                  <div className="whitespace-pre-wrap">{item.notas}</div>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button asChild size="sm" variant="outline" className="flex-1">
                  <Link to="/seguimentos/$id" params={{ id: item.id }}>Abrir ficha</Link>
                </Button>
                <Button asChild size="sm" variant="secondary" className="flex-1">
                  <Link to="/assessor">Falar com o Alfred</Link>
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}