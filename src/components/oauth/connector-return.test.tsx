// Golden: a página de retorno do OAuth nunca fica presa em "a validar".
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { readOAuthReturn } from "./return-state";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
}));

// eslint-disable-next-line import/first
import { ConnectorOAuthReturn } from "./connector-return";

function setSearch(search: string) {
  Object.defineProperty(window, "location", {
    writable: true,
    value: { search, origin: "http://localhost", replace: vi.fn() },
  });
}

describe("readOAuthReturn", () => {
  it("sucesso com código pede a troca", () => {
    expect(readOAuthReturn("?success=true&code=abc")).toEqual({ kind: "exchange", code: "abc" });
  });
  it("sucesso sem acesso offline fica concluído", () => {
    expect(readOAuthReturn("?success=true&offline_access_allowed=false")).toEqual({ kind: "done" });
  });
  it("falha devolve a mensagem do gateway", () => {
    expect(readOAuthReturn("?success=false&error=recusado")).toEqual({
      kind: "error", message: "recusado",
    });
  });
  it("sucesso sem código é erro", () => {
    expect(readOAuthReturn("?success=true").kind).toBe("error");
  });
});

describe("ConnectorOAuthReturn", () => {
  beforeEach(() => {
    (window as any).opener = undefined;
    window.close = vi.fn();
  });

  it("mostra confirmação e caminho de volta assim que o servidor confirma", async () => {
    setSearch("?success=true&code=abc");
    const complete = vi.fn().mockResolvedValue({ ok: true });
    render(
      <ConnectorOAuthReturn connectorId="google_calendar" label="Google Calendar" complete={complete} />,
    );
    expect(screen.getByTestId("oauth-return-message").textContent).toContain("A concluir");
    await waitFor(() =>
      expect(screen.getByTestId("oauth-return-message").textContent).toBe("Google Calendar ligado."),
    );
    await waitFor(() => expect(screen.getByTestId("oauth-return-back")).toBeTruthy());
    expect(complete).toHaveBeenCalledWith("abc");
  });

  it("mostra o erro e o botão de volta quando a troca falha", async () => {
    setSearch("?success=true&code=abc");
    render(
      <ConnectorOAuthReturn
        connectorId="google_calendar"
        label="Google Calendar"
        complete={() => Promise.reject(new Error("boom"))}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("oauth-return-message").textContent).toContain("Não consegui"),
    );
    expect(screen.getByTestId("oauth-return-back")).toBeTruthy();
  });
});
