"use client";

import { AlertCircleIcon } from "lucide-react";
import { type ErrorInfo, type ReactNode } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";

import { TmsUserConnectionErrorPanel } from "@/components/app-shell/tms-user-connection-prompt";
import { Button } from "@/components/ui/button";
import { TypographyP } from "@/components/ui/typography";
import { isTmsUserConnectionRequiredError } from "@/lib/providers/tms-user-connection-shared";
import { cn } from "@/lib/primitives/cn";

function logProjectFilesPanelError(scope: "tree" | "detail", error: Error, info: ErrorInfo) {
  console.error(`[project-files:${scope}]`, {
    name: error.name,
    message: error.message,
    stack: error.stack,
    componentStack: info.componentStack,
  });
}

function ProjectFilesPanelFallback({
  error,
  resetErrorBoundary,
  organizationSlug,
  scope,
  className,
}: FallbackProps & {
  organizationSlug: string;
  scope: "tree" | "detail";
  className?: string;
}) {
  if (isTmsUserConnectionRequiredError(error)) {
    return (
      <div className={cn("p-4", className)}>
        <TmsUserConnectionErrorPanel
          organizationSlug={organizationSlug}
          resource="files"
          error={error}
        />
      </div>
    );
  }

  const errorMessage = error instanceof Error ? error.message : "Failed to load files.";

  return (
    <div className={cn("flex min-h-48 flex-col justify-center gap-3 p-4", className)} role="alert">
      <div className="flex items-start gap-2">
        <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-flame-100" aria-hidden />
        <div className="space-y-1">
          <TypographyP className="text-sm font-medium text-flame-100">
            {scope === "tree" ? "Files failed to load." : "File preview failed to load."}
          </TypographyP>
          <TypographyP className="text-sm text-foreground/58">{errorMessage}</TypographyP>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={resetErrorBoundary}
      >
        Try again
      </Button>
    </div>
  );
}

export function ProjectFilesErrorBoundary({
  children,
  organizationSlug,
  scope,
  className,
  resetKeys,
  onReset,
}: {
  children: ReactNode;
  organizationSlug: string;
  scope: "tree" | "detail";
  className?: string;
  resetKeys?: readonly unknown[];
  onReset?: () => void;
}) {
  return (
    <ErrorBoundary
      fallbackRender={(fallbackProps) => (
        <ProjectFilesPanelFallback
          {...fallbackProps}
          organizationSlug={organizationSlug}
          scope={scope}
          className={className}
        />
      )}
      onError={(error, info) => {
        if (error instanceof Error) {
          logProjectFilesPanelError(scope, error, info);
        }
      }}
      onReset={onReset}
      resetKeys={resetKeys ? [...resetKeys] : undefined}
    >
      {children}
    </ErrorBoundary>
  );
}
