// @vitest-environment jsdom
import * as React from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  pushOverlay,
  popOverlay,
  getOverlayCount,
  subscribeOverlayCount,
} from "./overlay-stack";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

const locked = () => document.body.hasAttribute("data-scroll-locked");
const overlayCountAttr = () => document.body.getAttribute("data-overlay-count");

beforeEach(() => {
  while (getOverlayCount() > 0) popOverlay();
  document.body.removeAttribute("data-scroll-locked");
  document.body.removeAttribute("data-overlay-count");
});

afterEach(() => {
  cleanup();
});

describe("overlay-stack (contador)", () => {
  it("bloqueia ao primeiro overlay e liberta só no último", () => {
    pushOverlay();
    expect(locked()).toBe(true);
    expect(overlayCountAttr()).toBe("1");

    pushOverlay();
    expect(overlayCountAttr()).toBe("2");

    popOverlay();
    expect(locked()).toBe(true);
    expect(overlayCountAttr()).toBe("1");

    popOverlay();
    expect(locked()).toBe(false);
    expect(overlayCountAttr()).toBeNull();
  });

  it("nunca desce abaixo de zero e limpa pointer-events", () => {
    document.body.style.pointerEvents = "none";
    popOverlay();
    expect(getOverlayCount()).toBe(0);
    expect(document.body.style.pointerEvents).toBe("");
  });

  it("notifica subscritores em cada mudança", () => {
    const seen: number[] = [];
    const unsub = subscribeOverlayCount((n) => seen.push(n));
    pushOverlay();
    pushOverlay();
    popOverlay();
    popOverlay();
    unsub();
    pushOverlay();
    popOverlay();
    expect(seen).toEqual([1, 2, 1, 0]);
  });
});

function StackedDialogs() {
  return (
    <Dialog>
      <DialogTrigger>Abrir primeiro</DialogTrigger>
      <DialogContent>
        <DialogTitle>Primeiro</DialogTitle>
        <AlertDialog>
          <AlertDialogTrigger>Abrir segundo</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Segundo</AlertDialogTitle>
            <AlertDialogCancel>Cancelar segundo</AlertDialogCancel>
          </AlertDialogContent>
        </AlertDialog>
        <DialogClose>Fechar primeiro</DialogClose>
      </DialogContent>
    </Dialog>
  );
}

describe("modais empilhados", () => {
  it("mantém o lock enquanto houver um overlay aberto e liberta no fim", async () => {
    const user = userEvent.setup();
    render(<StackedDialogs />);
    expect(locked()).toBe(false);

    await user.click(screen.getByText("Abrir primeiro"));
    await screen.findByText("Primeiro");
    expect(locked()).toBe(true);
    expect(overlayCountAttr()).toBe("1");

    await user.click(screen.getByText("Abrir segundo"));
    await screen.findByText("Segundo");
    await waitFor(() => expect(overlayCountAttr()).toBe("2"));

    // fechar o de cima não pode libertar o scroll
    await user.click(screen.getByText("Cancelar segundo"));
    await waitFor(() => expect(overlayCountAttr()).toBe("1"));
    expect(locked()).toBe(true);

    await user.click(screen.getByText("Fechar primeiro"));
    await waitFor(() => expect(locked()).toBe(false));
    expect(overlayCountAttr()).toBeNull();
  });

  it("o foco entra no diálogo de cima e volta ao de baixo ao fechar", async () => {
    const user = userEvent.setup();
    render(<StackedDialogs />);

    await user.click(screen.getByText("Abrir primeiro"));
    const first = await screen.findByRole("dialog");
    await waitFor(() => expect(first.contains(document.activeElement)).toBe(true));

    const abrirSegundo = screen.getByText("Abrir segundo");
    await user.click(abrirSegundo);
    const second = await screen.findByRole("alertdialog");
    await waitFor(() => expect(second.contains(document.activeElement)).toBe(true));

    await user.click(screen.getByText("Cancelar segundo"));
    // foco regressa ao diálogo de baixo (trigger do segundo)
    await waitFor(() => {
      expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    });
  });

  it("abrir/fechar em sequência repetida não deixa lock pendurado", async () => {
    const user = userEvent.setup();
    render(<StackedDialogs />);

    for (let i = 0; i < 3; i += 1) {
      await user.click(screen.getByText("Abrir primeiro"));
      await screen.findByText("Primeiro");
      await user.click(screen.getByText("Abrir segundo"));
      await screen.findByText("Segundo");
      await user.click(screen.getByText("Cancelar segundo"));
      await waitFor(() => expect(overlayCountAttr()).toBe("1"));
      await user.click(screen.getByText("Fechar primeiro"));
      await waitFor(() => expect(locked()).toBe(false));
    }

    expect(getOverlayCount()).toBe(0);
    expect(document.body.style.pointerEvents).toBe("");
  });

  it("desmontagem abrupta do overlay repõe o body", async () => {
    const { unmount } = render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Só um</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    await waitFor(() => expect(locked()).toBe(true));
    act(() => unmount());
    await waitFor(() => expect(locked()).toBe(false));
  });
});
