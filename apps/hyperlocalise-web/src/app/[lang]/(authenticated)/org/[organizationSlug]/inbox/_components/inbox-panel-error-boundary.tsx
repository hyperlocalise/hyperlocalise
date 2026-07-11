"use client";

import { AlertCircleIcon } from "lucide-react";
import { type ErrorInfo, type ReactNode } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { FormattedMessage } from "react-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import { inboxPanelErrorBoundaryMessages } from "./inbox-panel-error-boundary.messages";

export type InboxPanelErrorBoundaryScope = "list" | "messages" | "details" | "composer";

type InboxPanelErrorBoundaryProps = {
  children: ReactNode;
  scope: InboxPanelErrorBoundaryScope;
  className?: string;
  resetKeys?: unknown[];
};

const panelTitleMessageByScope = {
  list: inboxPanelErrorBoundaryMessages.listTitle,
  messages: inboxPanelErrorBoundaryMessages.messagesTitle,
  details: inboxPanelErrorBoundaryMessages.detailsTitle,
  composer: inboxPanelErrorBoundaryMessages.composerTitle,
} as const;

function logInboxPanelError(scope: InboxPanelErrorBoundaryScope, error: Error, info: ErrorInfo) {
  console.error(`[inbox:${scope}]`, {
    name: error.name,
    message: error.message,
    stack: error.stack,
    componentStack: info.componentStack,
  });
}

function InboxPanelErrorFallback({
  error,
  resetErrorBoundary,
  scope,
  className,
}: FallbackProps & { scope: InboxPanelErrorBoundaryScope; className?: string }) {
  const errorMessage = error instanceof Error ? error.message : null;

  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col items-center justify-center p-4",
        className,
      )}
      role="alert"
      data-inbox-panel-error={scope}
    >
      <Alert variant="destructive" className="max-w-md">
        <AlertCircleIcon />
        <AlertTitle>
          <FormattedMessage {...panelTitleMessageByScope[scope]} />
        </AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            <FormattedMessage {...inboxPanelErrorBoundaryMessages.description} />
          </p>
          {process.env.NODE_ENV !== "production" && errorMessage ? (
            <p className="font-mono text-xs break-words">{errorMessage}</p>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={resetErrorBoundary}>
            <FormattedMessage {...inboxPanelErrorBoundaryMessages.retry} />
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}

export function InboxPanelErrorBoundary({
  children,
  scope,
  className,
  resetKeys,
}: InboxPanelErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallbackRender={(fallbackProps) => (
        <InboxPanelErrorFallback {...fallbackProps} scope={scope} className={className} />
      )}
      onError={(error, info) => {
        if (error instanceof Error) {
          logInboxPanelError(scope, error, info);
        }
      }}
      resetKeys={resetKeys}
    >
      {children}
    </ErrorBoundary>
  );
}
