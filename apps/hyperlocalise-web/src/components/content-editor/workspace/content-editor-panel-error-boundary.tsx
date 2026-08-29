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
import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ErrorInfo, type ReactNode } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { FormattedMessage } from "react-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import { contentEditorPanelErrorBoundaryMessages } from "@/components/content-editor/shared/content-editor.messages";

export type ContentEditorPanelErrorBoundaryScope =
  | "queue"
  | "editor"
  | "intelligence"
  | "workspace";

type ContentEditorPanelErrorBoundaryProps = {
  children: ReactNode;
  scope: ContentEditorPanelErrorBoundaryScope;
  className?: string;
  resetKeys?: unknown[];
};

const panelTitleMessageByScope = {
  queue: contentEditorPanelErrorBoundaryMessages.queuePanelTitle,
  editor: contentEditorPanelErrorBoundaryMessages.editorPanelTitle,
  intelligence: contentEditorPanelErrorBoundaryMessages.intelligencePanelTitle,
  workspace: contentEditorPanelErrorBoundaryMessages.workspaceTitle,
} as const;

function logCatPanelError(
  scope: ContentEditorPanelErrorBoundaryScope,
  error: Error,
  info: ErrorInfo,
) {
  console.error(`[cat:${scope}]`, {
    name: error.name,
    message: error.message,
    stack: error.stack,
    componentStack: info.componentStack,
  });
}

function ContentEditorPanelErrorFallback({
  error,
  resetErrorBoundary,
  scope,
  className,
}: FallbackProps & { scope: ContentEditorPanelErrorBoundaryScope; className?: string }) {
  const errorMessage = error instanceof Error ? error.message : null;

  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col items-center justify-center p-4",
        className,
      )}
      role="alert"
    >
      <Alert variant="destructive" className="max-w-md">
        <HugeiconsIcon icon={AlertCircleIcon} />
        <AlertTitle>
          <FormattedMessage {...panelTitleMessageByScope[scope]} />
        </AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            <FormattedMessage {...contentEditorPanelErrorBoundaryMessages.description} />
          </p>
          {process.env.NODE_ENV !== "production" && errorMessage ? (
            <p className="font-mono text-xs break-words">{errorMessage}</p>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={resetErrorBoundary}>
            <FormattedMessage {...contentEditorPanelErrorBoundaryMessages.retry} />
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}

export function ContentEditorPanelErrorBoundary({
  children,
  scope,
  className,
  resetKeys,
}: ContentEditorPanelErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallbackRender={(fallbackProps) => (
        <ContentEditorPanelErrorFallback {...fallbackProps} scope={scope} className={className} />
      )}
      onError={(error, info) => {
        if (error instanceof Error) {
          logCatPanelError(scope, error, info);
        }
      }}
      resetKeys={resetKeys}
    >
      {children}
    </ErrorBoundary>
  );
}
