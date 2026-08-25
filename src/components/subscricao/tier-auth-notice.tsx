import { useEffectiveTier } from "@/lib/subscription/use-effective-tier";

/**
 * Aviso amigável quando não foi possível confirmar o plano do consultor
 * (sessão expirada ou backend indisponível). Enquanto isso, a app funciona
 * com as funcionalidades do plano base — nada é apagado nem alterado.
 */
export function TierAuthNotice() {
  const { data } = useEffectiveTier();
  const reason = data?.reason;
  if (!reason) return null;

  const isAuth = reason === "no_bearer" || reason === "malformed_token" || reason === "invalid_claims";
  const message = isAuth
    ? "Não conseguimos confirmar o teu plano — a sessão pode ter expirado. Volta a entrar para recuperares tudo o que o teu plano inclui."
    : "Não conseguimos confirmar o teu plano agora. Estamos a tentar outra vez em segundo plano; entretanto vês as funcionalidades do plano base.";

  return (
    <div
      className="mb-4 rounded-xl px-4 py-3 text-[13px] leading-relaxed"
      style={{
        border: "1px solid color-mix(in srgb, var(--warn, #B8863B) 45%, var(--line))",
        background: "color-mix(in srgb, var(--warn, #B8863B) 8%, transparent)",
      }}
      role="status"
    >
      <span>{message}</span>
      {isAuth ? (
        <a href="/auth" className="ml-2 underline underline-offset-2">
          Entrar novamente
        </a>
      ) : null}
    </div>
  );
}
