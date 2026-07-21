"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { FormattedMessage } from "react-intl";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/primitives/cn";

import { issueDetailPanelMessages as messages } from "./issue-detail-panel.messages";
import { IssueDetailPanel, type IssueDetailPanelHandle } from "./issue-detail-panel";

function isSheetCloseTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(
    target.closest('[data-slot="sheet-close"]') || target.closest('[data-slot="sheet-overlay"]'),
  );
}

export function IssueDetailDrawer({
  organizationSlug,
  projectId,
  issueId,
  isOpen,
  onOpenChange,
  returnFocusRef,
}: {
  organizationSlug: string;
  projectId: string | undefined;
  issueId: string | undefined;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<IssueDetailPanelHandle>(null);
  const wasOpenRef = useRef(false);
  const closingSheetRef = useRef(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [isSavingClose, setIsSavingClose] = useState(false);

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      closingSheetRef.current = false;
      const frame = window.requestAnimationFrame(() => {
        const closeButton = contentRef.current?.querySelector<HTMLElement>(
          '[data-slot="sheet-close"]',
        );
        closeButton?.focus();
      });
      return () => window.cancelAnimationFrame(frame);
    }

    setConfirmCloseOpen(false);
    setIsSavingClose(false);

    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      returnFocusRef?.current?.focus();
    }
  }, [isOpen, returnFocusRef]);

  // Suppress blur autosave before focus leaves the field when the user starts closing.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const suppressBeforeCloseInteraction = (event: Event) => {
      if (isSheetCloseTarget(event.target)) {
        panelRef.current?.beginCloseConfirm();
      }
    };

    const suppressBeforeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        panelRef.current?.beginCloseConfirm();
      }
    };

    document.addEventListener("pointerdown", suppressBeforeCloseInteraction, true);
    document.addEventListener("keydown", suppressBeforeEscape, true);
    return () => {
      document.removeEventListener("pointerdown", suppressBeforeCloseInteraction, true);
      document.removeEventListener("keydown", suppressBeforeEscape, true);
    };
  }, [isOpen]);

  const resolvedProjectId = projectId;
  const resolvedIssueId = issueId;

  const keepEditing = () => {
    closingSheetRef.current = false;
    setConfirmCloseOpen(false);
    setIsSavingClose(false);
    panelRef.current?.endCloseConfirm();
  };

  const closeSheetWithoutReenablingAutosave = () => {
    closingSheetRef.current = true;
    panelRef.current?.beginCloseConfirm();
    setConfirmCloseOpen(false);
    setIsSavingClose(false);
    onOpenChange(false);
  };

  const requestClose = () => {
    const panel = panelRef.current;
    if (!panel) {
      closingSheetRef.current = true;
      onOpenChange(false);
      return;
    }
    panel.beginCloseConfirm();
    if (panel.isDirty()) {
      setConfirmCloseOpen(true);
      return;
    }
    closeSheetWithoutReenablingAutosave();
  };

  const handleDiscard = () => {
    panelRef.current?.discardPending();
    closeSheetWithoutReenablingAutosave();
  };

  const handleSaveAndClose = async () => {
    setIsSavingClose(true);
    try {
      await panelRef.current?.savePending();
      closeSheetWithoutReenablingAutosave();
    } catch {
      setIsSavingClose(false);
    }
  };

  return (
    <>
      <Sheet
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            requestClose();
          }
        }}
      >
        <SheetContent
          side="right"
          className={cn(
            "overflow-hidden p-0",
            "data-[side=right]:w-full data-[side=right]:max-w-none",
            "data-[side=right]:sm:max-w-4xl data-[side=right]:md:max-w-5xl",
          )}
        >
          <div ref={contentRef} className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 border-b border-border px-6 py-4 pe-14">
              <SheetTitle className="text-sm font-medium text-muted-foreground">
                <FormattedMessage {...messages.sheetTitle} />
              </SheetTitle>
              <SheetDescription className="sr-only">
                <FormattedMessage {...messages.sheetTitle} />
              </SheetDescription>
            </SheetHeader>
            {isOpen && resolvedProjectId && resolvedIssueId ? (
              <IssueDetailPanel
                ref={panelRef}
                organizationSlug={organizationSlug}
                projectId={resolvedProjectId}
                issueId={resolvedIssueId}
              />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={confirmCloseOpen}
        onOpenChange={(open) => {
          if (isSavingClose) {
            return;
          }
          if (!open) {
            if (closingSheetRef.current) {
              setConfirmCloseOpen(false);
              return;
            }
            keepEditing();
            return;
          }
          setConfirmCloseOpen(true);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <FormattedMessage {...messages.unsavedChangesTitle} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <FormattedMessage {...messages.unsavedChangesDescription} />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSavingClose} onClick={keepEditing}>
              <FormattedMessage {...messages.unsavedChangesKeepEditing} />
            </AlertDialogCancel>
            <Button
              variant="outline"
              disabled={isSavingClose}
              onPointerDown={() => panelRef.current?.beginCloseConfirm()}
              onClick={handleDiscard}
            >
              <FormattedMessage {...messages.unsavedChangesDiscard} />
            </Button>
            <Button
              disabled={isSavingClose}
              onPointerDown={() => panelRef.current?.beginCloseConfirm()}
              onClick={() => void handleSaveAndClose()}
            >
              <FormattedMessage {...messages.unsavedChangesSave} />
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
