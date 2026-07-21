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
          "w-full overflow-y-auto p-0",
          isMobile
            ? "max-w-none data-[side=right]:sm:max-w-none"
            : "data-[side=right]:sm:max-w-3xl data-[side=right]:md:max-w-4xl",
        )}
      >
        <div ref={contentRef} className="flex min-h-full flex-col">
          <SheetHeader className="border-b border-border px-6 py-4 pe-14">
            <SheetTitle className="text-sm font-medium text-muted-foreground">
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
