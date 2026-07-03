"use client";

import { AlertCircleIcon } from "lucide-react";
import { type ErrorInfo, type ReactNode } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { FormattedMessage } from "react-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import { catPanelErrorBoundaryMessages } from "@/components/cat/shared/cat.messages";

export type CatPanelErrorBoundaryScope = "queue" | "editor" | "intelligence" | "workspace";

type CatPanelErrorBoundaryProps = {
  children: ReactNode;
  scope: CatPanelErrorBoundaryScope;
  className?: string;
  resetKeys?: unknown[];
};

const panelTitleMessageByScope = {
  queue: catPanelErrorBoundaryMessages.queuePanelTitle,
  editor: catPanelErrorBoundaryMessages.editorPanelTitle,
  intelligence: catPanelErrorBoundaryMessages.intelligencePanelTitle,
  workspace: catPanelErrorBoundaryMessages.workspaceTitle,
} as const;

function logCatPanelError(scope: CatPanelErrorBoundaryScope, error: Error, info: ErrorInfo) {
  console.error(`[cat:${scope}]`, {
    name: error.name,
    message: error.message,
    stack: error.stack,
    componentStack: info.componentStack,
  });
}

function CatPanelErrorFallback({
  error,
  resetErrorBoundary,
  scope,
  className,
}: FallbackProps & { scope: CatPanelErrorBoundaryScope; className?: string }) {
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
        <AlertCircleIcon />
        <AlertTitle>
          <FormattedMessage {...panelTitleMessageByScope[scope]} />
        </AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            <FormattedMessage {...catPanelErrorBoundaryMessages.description} />
          </p>
          {process.env.NODE_ENV !== "production" && errorMessage ? (
            <p className="font-mono text-xs break-words">{errorMessage}</p>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={resetErrorBoundary}>
            <FormattedMessage {...catPanelErrorBoundaryMessages.retry} />
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}

export function CatPanelErrorBoundary({
  children,
  scope,
  className,
  resetKeys,
}: CatPanelErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallbackRender={(fallbackProps) => (
        <CatPanelErrorFallback {...fallbackProps} scope={scope} className={className} />
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
