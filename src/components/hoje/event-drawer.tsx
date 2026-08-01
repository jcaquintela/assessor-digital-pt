import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";
import { formatDataHora } from "@/lib/demo-data";
import { CalendarClock, User, Building2, ExternalLink, Briefcase, Phone } from "lucide-react";
import { useAssessorName, ASSESSOR_NAME_DEFAULT } from "@/lib/assessor/assessor-name";

export interface EventDrawerItem {
  id: string;
  titulo: string;
  data: string;
  hora?: string;
  pessoaNome?: string | null;
  pessoaId?: string | null;
  pessoaTelefone?: string | null;
  imovelTitulo?: string | null;
  imovelId?: string | null;
  negocioId?: string | null;
  negocioLabel?: string | null;
  notas?: string | null;
  estado?: string;
  tipo?: string;
  prioridade?: string;
  /** Porque é que isto está no topo do dia (frase já pronta). */
  motivo?: string | null;
}

export function EventDrawer({ item, onClose }: { item: EventDrawerItem | null; onClose: () => void }) {
  const { name: assessorName } = useAssessorName();
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
              <div className="flex flex-wrap gap-1.5">
                {item.tipo && <Badge variant="secondary">{item.tipo}</Badge>}
                {item.estado && <Badge variant="outline">{item.estado}</Badge>}
                {item.prioridade && <Badge variant="outline">Prioridade {item.prioridade.toLowerCase()}</Badge>}
              </div>

              {item.motivo && (
                <div className="rounded-lg border border-border p-3">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">Porque está aqui</div>
                  <div>{item.motivo}</div>
                </div>
              )}

              {item.pessoaId && (
                <Link to="/pessoas/$id" params={{ id: item.pessoaId }} className="flex items-center gap-2 rounded-lg border border-border p-3 hover:bg-muted">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">
                    {item.pessoaNome ?? "Pessoa"}
                    {item.pessoaTelefone ? <span className="ml-2 text-xs text-muted-foreground"><Phone className="mr-1 inline h-3 w-3" />{item.pessoaTelefone}</span> : null}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </Link>
              )}
              {item.negocioId && (
                <Link to="/oportunidades/$id" params={{ id: item.negocioId }} className="flex items-center gap-2 rounded-lg border border-border p-3 hover:bg-muted">
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">{item.negocioLabel ?? "Negócio"}</span>
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
              {!item.pessoaId && !item.negocioId && !item.imovelId && (
                <div className="rounded-lg border border-dashed border-border p-3 text-muted-foreground">
                  Ainda não está ligado a ninguém nem a um negócio. Abre a ficha para associar.
                </div>
              )}
              {item.notas ? (
                <div className="rounded-lg border border-border p-3">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">Notas</div>
                  <div className="whitespace-pre-wrap">{item.notas}</div>
                </div>
              ) : null}
              <div className="flex gap-2 pt-2">
                <Button asChild size="sm" variant="outline" className="flex-1">
                  <Link to="/seguimentos/$id" params={{ id: item.id }}>Abrir ficha</Link>
                </Button>
                <Button asChild size="sm" variant="secondary" className="flex-1">
                  <Link to="/assessor">
                    Falar com {assessorName === ASSESSOR_NAME_DEFAULT ? "o Assessor" : assessorName}
                  </Link>
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}