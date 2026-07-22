"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { AlertCircleIcon } from "lucide-react";
import { type ErrorInfo, type ReactNode } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { FormattedMessage, useIntl } from "react-intl";

import { TmsUserConnectionErrorPanel } from "@/components/app-shell/tms-user-connection-prompt";
import { Button } from "@/components/ui/button";
import { TypographyP } from "@/components/ui/typography";
import { isTmsUserConnectionRequiredError } from "@/lib/providers/credentials/tms-user-connection-shared";
import { cn } from "@/lib/primitives/cn";

import { projectFilesErrorBoundaryMessages as messages } from "./project-files-error-boundary.messages";

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
  const intl = useIntl();

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

  const errorMessage =
    error instanceof Error ? error.message : intl.formatMessage(messages.loadFailedFallback);

  return (
    <div className={cn("flex min-h-48 flex-col justify-center gap-3 p-4", className)} role="alert">
      <div className="flex items-start gap-2">
        <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-flame-100" aria-hidden />
        <div className="space-y-1">
          <TypographyP className="text-sm font-medium text-flame-100">
            {scope === "tree" ? (
              <FormattedMessage {...messages.treeFailed} />
            ) : (
              <FormattedMessage {...messages.detailFailed} />
            )}
          </TypographyP>
          <TypographyP className="text-sm text-muted-foreground">{errorMessage}</TypographyP>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={resetErrorBoundary}
      >
        <FormattedMessage {...messages.tryAgain} />
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
