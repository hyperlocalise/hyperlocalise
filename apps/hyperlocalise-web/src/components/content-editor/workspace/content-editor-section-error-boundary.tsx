"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { WarningCircleIcon } from "@phosphor-icons/react";
import { type ReactNode } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import { contentEditorPanelErrorBoundaryMessages } from "@/components/content-editor/shared/content-editor.messages";

type ContentEditorSectionErrorBoundaryProps = {
  /** Stable name used in logs, for example `editor.comments`. */
  section: string;
  children: ReactNode;
  className?: string;
  resetKeys?: unknown[];
};

function ContentEditorSectionErrorFallback({
  error,
  resetErrorBoundary,
  className,
}: FallbackProps & { className?: string }) {
  const errorMessage = error instanceof Error ? error.message : null;

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm",
        className,
      )}
    >
      <WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-foreground">
          <FormattedMessage {...contentEditorPanelErrorBoundaryMessages.sectionDescription} />
        </p>
        {process.env.NODE_ENV !== "production" && errorMessage ? (
          <p className="font-mono text-xs break-words text-subtle-foreground">{errorMessage}</p>
        ) : null}
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={resetErrorBoundary}>
        <FormattedMessage {...contentEditorPanelErrorBoundaryMessages.retry} />
      </Button>
    </div>
  );
}

export function ContentEditorSectionErrorBoundary({
  section,
  children,
  className,
  resetKeys,
}: ContentEditorSectionErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallbackRender={(fallbackProps) => (
        <ContentEditorSectionErrorFallback {...fallbackProps} className={className} />
      )}
      onError={(error, info) => {
        if (error instanceof Error) {
          console.error(`[cat:${section}]`, {
            name: error.name,
            message: error.message,
            stack: error.stack,
            componentStack: info.componentStack,
          });
        }
      }}
      resetKeys={resetKeys}
    >
      {children}
    </ErrorBoundary>
  );
}
