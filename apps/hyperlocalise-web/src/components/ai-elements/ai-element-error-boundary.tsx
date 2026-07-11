"use client";

import { AlertCircleIcon } from "lucide-react";
import { type ErrorInfo, type ReactNode } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { FormattedMessage } from "react-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import { aiElementErrorBoundaryMessages } from "./ai-element-error-boundary.messages";

export type AiElementErrorBoundaryScope =
  | "message"
  | "tool"
  | "reasoning"
  | "sources"
  | "code-block";

type AiElementErrorBoundaryProps = {
  children: ReactNode;
  scope: AiElementErrorBoundaryScope;
  className?: string;
  resetKeys?: unknown[];
};

const panelTitleMessageByScope = {
  message: aiElementErrorBoundaryMessages.messageTitle,
  tool: aiElementErrorBoundaryMessages.toolTitle,
  reasoning: aiElementErrorBoundaryMessages.reasoningTitle,
  sources: aiElementErrorBoundaryMessages.sourcesTitle,
  "code-block": aiElementErrorBoundaryMessages.codeBlockTitle,
} as const;

function logAiElementError(scope: AiElementErrorBoundaryScope, error: Error, info: ErrorInfo) {
  console.error(`[ai-elements:${scope}]`, {
    name: error.name,
    message: error.message,
    stack: error.stack,
    componentStack: info.componentStack,
  });
}

function AiElementErrorFallback({
  error,
  resetErrorBoundary,
  scope,
  className,
}: FallbackProps & { scope: AiElementErrorBoundaryScope; className?: string }) {
  const errorMessage = error instanceof Error ? error.message : null;

  return (
    <div
      className={cn("my-2 w-full min-w-0", className)}
      role="alert"
      data-ai-element-error={scope}
    >
      <Alert variant="destructive" className="max-w-full">
        <AlertCircleIcon />
        <AlertTitle>
          <FormattedMessage {...panelTitleMessageByScope[scope]} />
        </AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            <FormattedMessage {...aiElementErrorBoundaryMessages.description} />
          </p>
          {process.env.NODE_ENV !== "production" && errorMessage ? (
            <p className="font-mono text-xs break-words">{errorMessage}</p>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={resetErrorBoundary}>
            <FormattedMessage {...aiElementErrorBoundaryMessages.retry} />
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}

export function AiElementErrorBoundary({
  children,
  scope,
  className,
  resetKeys,
}: AiElementErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallbackRender={(fallbackProps) => (
        <AiElementErrorFallback {...fallbackProps} scope={scope} className={className} />
      )}
      onError={(error, info) => {
        if (error instanceof Error) {
          logAiElementError(scope, error, info);
        }
      }}
      resetKeys={resetKeys}
    >
      {children}
    </ErrorBoundary>
  );
}
