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
import { type ErrorInfo, type ReactNode } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { FormattedMessage } from "react-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import { localisationAuditResultErrorBoundaryMessages as messages } from "./localisation-audit-result-error-boundary.messages";

export type LocalisationAuditResultErrorBoundaryScope = "report" | "section";

type LocalisationAuditResultErrorBoundaryProps = {
  children: ReactNode;
  scope: LocalisationAuditResultErrorBoundaryScope;
  /** Stable name used in logs, for example `cta` or `findings`. */
  section?: string;
  className?: string;
  resetKeys?: unknown[];
};

const titleMessageByScope = {
  report: messages.reportTitle,
  section: messages.sectionTitle,
} as const;

const descriptionMessageByScope = {
  report: messages.reportDescription,
  section: messages.sectionDescription,
} as const;

function logLocalisationAuditResultError(
  scope: LocalisationAuditResultErrorBoundaryScope,
  section: string | undefined,
  error: Error,
  info: ErrorInfo,
) {
  console.error(`[localisation-audit:${scope}${section ? `:${section}` : ""}]`, {
    name: error.name,
    message: error.message,
    stack: error.stack,
    componentStack: info.componentStack,
  });
}

function LocalisationAuditResultErrorFallback({
  error,
  resetErrorBoundary,
  scope,
  className,
}: FallbackProps & {
  scope: LocalisationAuditResultErrorBoundaryScope;
  className?: string;
}) {
  const errorMessage = error instanceof Error ? error.message : null;

  return (
    <div
      className={cn(
        scope === "report" ? "flex min-h-[40vh] items-center justify-center px-5 py-12" : "py-6",
        className,
      )}
      data-localisation-audit-error={scope}
    >
      <Alert variant="destructive" className="max-w-xl">
        <WarningCircleIcon />
        <AlertTitle>
          <FormattedMessage {...titleMessageByScope[scope]} />
        </AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            <FormattedMessage {...descriptionMessageByScope[scope]} />
          </p>
          {process.env.NODE_ENV !== "production" && errorMessage ? (
            <p className="font-mono text-xs break-words">{errorMessage}</p>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={resetErrorBoundary}>
            <FormattedMessage {...messages.retry} />
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}

export function LocalisationAuditResultErrorBoundary({
  children,
  scope,
  section,
  className,
  resetKeys,
}: LocalisationAuditResultErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallbackRender={(fallbackProps) => (
        <LocalisationAuditResultErrorFallback
          {...fallbackProps}
          scope={scope}
          className={className}
        />
      )}
      onError={(error, info) => {
        if (error instanceof Error) {
          logLocalisationAuditResultError(scope, section, error, info);
        }
      }}
      resetKeys={resetKeys}
    >
      {children}
    </ErrorBoundary>
  );
}
