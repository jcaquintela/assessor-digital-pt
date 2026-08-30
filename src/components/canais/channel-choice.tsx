import { Check, MessageCircle, Send } from "lucide-react";

/**
 * Escolha de canal (WhatsApp em destaque vs Telegram gratuito).
 * Componente puro — usado em /ligar-canal e no harness de regressão visual.
 *
 * `planoPago`: conta que já paga um plano com WhatsApp incluído. Nesse caso
 * nunca se oferece o teste de 14 dias (o servidor também o recusa) — o canal
 * já faz parte do plano.
 */
export function ChannelChoice({
  onChoose,
  planoPago = false,
  nomePlano,
}: {
  onChoose: (c: "whatsapp" | "telegram") => void;
  planoPago?: boolean;
  nomePlano?: string;
}) {
  return (
    <ul data-testid="escolha-canal" className="mt-6 grid grid-cols-1 items-start gap-4 md:grid-cols-2">
      <li data-testid="canal-whatsapp" className="c-card min-w-0 border-2 border-[var(--accent,#0f766e)] p-5">
        <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <h2 className="c-section-title flex min-w-0 items-center gap-2">
            <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">WhatsApp</span>
          </h2>
          <span className="c-badge ok shrink-0 whitespace-nowrap">
            {planoPago
              ? nomePlano
                ? `Incluído no plano ${nomePlano}`
                : "Incluído no teu plano"
              : "14 dias grátis"}
          </span>
        </div>
        <p className="text-[13px] leading-relaxed break-words">
          {planoPago ? (
            <>
              O WhatsApp já faz parte do teu plano. Falas comigo no canal que usas o dia
              todo, envias áudios, fotos e documentos, e eu trato dos seguimentos e
              lembretes por iniciativa própria.
            </>
          ) : (
            <>
              Experimenta o plano Consultor durante 14 dias, sem pagamento e sem cartão.
              Falas comigo no WhatsApp que já usas o dia todo, envias áudios, fotos e
              documentos, e eu trato dos seguimentos e lembretes por iniciativa própria.
            </>
          )}
        </p>
        <ul className="c-muted mt-3 space-y-1 text-[13px]">
          <li className="flex min-w-0 gap-2"><Check className="mt-[3px] h-3.5 w-3.5 shrink-0" aria-hidden="true" /> <span className="min-w-0 break-words">Áudios, fotos e documentos no canal onde já trabalhas</span></li>
          <li className="flex min-w-0 gap-2"><Check className="mt-[3px] h-3.5 w-3.5 shrink-0" aria-hidden="true" /> <span className="min-w-0 break-words">Lembretes e seguimentos proativos</span></li>
          {!planoPago && (
            <li className="flex min-w-0 gap-2"><Check className="mt-[3px] h-3.5 w-3.5 shrink-0" aria-hidden="true" /> <span className="min-w-0 break-words">No fim dos 14 dias escolhes: continuar num plano pago ou ficar em Base</span></li>
          )}
        </ul>
        <button
          type="button"
          className="c-cta mt-4 min-h-11 w-full justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
          onClick={() => onChoose("whatsapp")}
        >
          {planoPago ? "Ligar WhatsApp" : "Começar os 14 dias no WhatsApp"}
        </button>
      </li>


      <li data-testid="canal-telegram" className="c-card min-w-0 p-5">
        <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <h2 className="c-section-title flex min-w-0 items-center gap-2">
            <Send className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">Telegram</span>
          </h2>
          <span className="c-badge shrink-0 whitespace-nowrap">Grátis para sempre</span>
        </div>
        <p className="text-[13px] leading-relaxed break-words">
          Plano Base, sem custos e sem prazo. Guardo pessoas, imóveis e seguimentos a
          partir do que me escreves — mas não tomo iniciativa nem uso WhatsApp.
        </p>
        <button
          type="button"
          className="c-btn mt-4 min-h-11 w-full justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
          onClick={() => onChoose("telegram")}
        >
          Ligar Telegram (grátis)
        </button>
      </li>
    </ul>
  );
}
