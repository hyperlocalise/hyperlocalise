"use client";

import { useEffect, useRef, type RefObject } from "react";
import { FormattedMessage } from "react-intl";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/primitives/cn";

import { issueDetailPanelMessages as messages } from "./issue-detail-panel.messages";
import { IssueDetailPanel } from "./issue-detail-panel";

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
  const isMobile = useIsMobile();
  const contentRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      const frame = window.requestAnimationFrame(() => {
        const closeButton = contentRef.current?.querySelector<HTMLElement>(
          '[data-slot="sheet-close"]',
        );
        closeButton?.focus();
      });
      return () => window.cancelAnimationFrame(frame);
    }

    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      returnFocusRef?.current?.focus();
    }
  }, [isOpen, returnFocusRef]);

  const resolvedProjectId = projectId;
  const resolvedIssueId = issueId;

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onOpenChange(false);
        }
      }}
    >
      <SheetContent
        side="right"
        className={cn(
          "w-full overflow-y-auto",
          isMobile ? "max-w-none sm:max-w-none" : "sm:max-w-xl md:max-w-2xl",
        )}
      >
        <div ref={contentRef}>
          <SheetHeader>
            <SheetTitle>
              <FormattedMessage {...messages.sheetTitle} />
            </SheetTitle>
            <SheetDescription className="sr-only">
              <FormattedMessage {...messages.sheetTitle} />
            </SheetDescription>
          </SheetHeader>
          {isOpen && resolvedProjectId && resolvedIssueId ? (
            <IssueDetailPanel
              organizationSlug={organizationSlug}
              projectId={resolvedProjectId}
              issueId={resolvedIssueId}
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
