// @vitest-environment jsdom
import * as React from "react";
import { it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getOverlayCount } from "@/lib/ui/overlay-stack";
import { Dialog, DialogContent, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogTrigger, AlertDialogCancel } from "@/components/ui/alert-dialog";

it("dbg", async () => {
  const user = userEvent.setup();
  render(
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
    </Dialog>,
  );
  await user.click(screen.getByText("Abrir primeiro"));
  await screen.findByText("Primeiro");
  console.log("after open1", getOverlayCount());
  await user.click(screen.getByText("Abrir segundo"));
  await screen.findByText("Segundo");
  console.log("after open2", getOverlayCount());
  await user.click(screen.getByText("Cancelar segundo"));
  await new Promise(r => setTimeout(r, 500));
  console.log("after close2", getOverlayCount(), !!screen.queryByText("Segundo"), document.body.style.pointerEvents);
  await user.click(screen.getByText("Fechar primeiro"));
  await new Promise(r => setTimeout(r, 500));
  console.log("after close1", getOverlayCount(), !!screen.queryByText("Primeiro"));
});
