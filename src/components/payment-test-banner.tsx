const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

// Avisa quando o checkout está em modo de teste (ou por configurar).
export function PaymentTestModeBanner() {
  if (!clientToken) {
    return (
      <div className="c-card mb-4 p-3 text-[13px]" style={{ borderColor: "var(--coral, #dc2626)" }}>
        Os pagamentos reais ainda não estão ativos nesta versão. Conclui a passagem a produção para receber pagamentos.
      </div>
    );
  }
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="c-card mb-4 p-3 text-[13px]" style={{ borderColor: "var(--amber, #d97706)" }}>
        Estás em modo de teste: os pagamentos feitos aqui não movimentam dinheiro real.
      </div>
    );
  }
  return null;
}