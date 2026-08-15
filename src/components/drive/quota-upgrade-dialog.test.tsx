// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QuotaUpgradeDialog } from "./quota-upgrade-dialog";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

describe("QuotaUpgradeDialog", () => {
  it("abre a modal com resumo de consumo ao clicar no botão", () => {
    render(
      <QuotaUpgradeDialog
        used={36}
        limit={40}
        label="Base"
        hint="Estás quase no limite (90%)."
        preview={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /fazer upgrade/i }));

    expect(screen.getByRole("heading", { name: /resumo de consumo/i })).toBeTruthy();
    expect(screen.getByText("36 de 40")).toBeTruthy();
    expect(screen.getByText("90%")).toBeTruthy();
    expect(screen.getByText("4 restantes")).toBeTruthy();
    expect(screen.getByText(/estás quase no limite/i)).toBeTruthy();
    const upgradeLink = screen.getByRole("link", { name: /fazer upgrade/i });
    expect(upgradeLink.getAttribute("href")).toBe("/subscricao");
  });

  it("mostra estado de limite atingido", () => {
    render(
      <QuotaUpgradeDialog
        used={40}
        limit={40}
        label="Base"
        hint="Atingiste o limite."
        preview={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /fazer upgrade/i }));

    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.getByText(/atingiste o limite mensal/i)).toBeTruthy();
  });
});
