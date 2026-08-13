// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExpandableText } from "./expandable-text";

describe("ExpandableText", () => {
  const long = "a".repeat(400);
  it("trunca contexto longo com 'ver mais'", () => {
    render(<ExpandableText text={long} />);
    expect(screen.getByText(/ver mais/)).toBeTruthy();
    expect(document.body.textContent!.includes("a".repeat(300))).toBe(false);
    fireEvent.click(screen.getByText(/ver mais/));
    expect(document.body.textContent!.includes("a".repeat(400))).toBe(true);
  });
  it("texto curto aparece inteiro sem botão", () => {
    render(<ExpandableText text="Nota curta" />);
    expect(screen.queryByText(/ver mais/)).toBeNull();
  });
});
