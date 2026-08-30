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
import type { ReactNode } from "react";
import { Settings02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage } from "react-intl";

import { formatRelativeTimestamp } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/_components/workspace-files-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/primitives/cn";

import { aiEnginePageContentMessages } from "./ai-engine-page-content.messages";

type AiEngineCurrentSetupPanelProps = {
  isLoading: boolean;
  providerLabel: string;
  isIncluded: boolean;
  defaultModel: string;
  maskedApiKeySuffix?: string;
  lastValidatedAt?: string;
  onManageProvider?: () => void;
  manageDisabled?: boolean;
};

function SetupField({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}

export function AiEngineCurrentSetupPanel({
  isLoading,
  providerLabel,
  isIncluded,
  defaultModel,
  maskedApiKeySuffix,
  lastValidatedAt,
  onManageProvider,
  manageDisabled = false,
}: AiEngineCurrentSetupPanelProps) {
  if (isLoading) {
    return <Skeleton className="h-36 w-full rounded-lg" aria-hidden />;
  }

  const validatedLabel = lastValidatedAt ? formatRelativeTimestamp(lastValidatedAt) : null;

  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4 text-card-foreground">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            <FormattedMessage {...aiEnginePageContentMessages.currentSetupTitle} />
          </p>
          <p className="text-sm text-muted-foreground">
            <FormattedMessage {...aiEnginePageContentMessages.currentSetupDescription} />
          </p>
        </div>
        {!isIncluded && onManageProvider ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={manageDisabled}
            onClick={onManageProvider}
          >
            <HugeiconsIcon icon={Settings02Icon} strokeWidth={1.8} className="size-4" />
            <FormattedMessage {...aiEnginePageContentMessages.manageProviderAction} />
          </Button>
        ) : null}
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SetupField
          label={<FormattedMessage {...aiEnginePageContentMessages.currentSetupProviderLabel} />}
          value={
            <span className="inline-flex flex-wrap items-center gap-2">
              {providerLabel}
              {isIncluded ? (
                <Badge variant="outline" className="text-[10px]">
                  <FormattedMessage {...aiEnginePageContentMessages.includedBadge} />
                </Badge>
              ) : null}
            </span>
          }
        />
        <SetupField
          label={<FormattedMessage {...aiEnginePageContentMessages.currentSetupModelLabel} />}
          value={defaultModel}
        />
        {!isIncluded ? (
          <>
            <SetupField
              label={<FormattedMessage {...aiEnginePageContentMessages.currentSetupApiKeyLabel} />}
              value={
                maskedApiKeySuffix ? (
                  <span className="font-mono text-sm">{`••••${maskedApiKeySuffix}`}</span>
                ) : (
                  "—"
                )
              }
            />
            <SetupField
              label={
                <FormattedMessage {...aiEnginePageContentMessages.currentSetupValidatedLabel} />
              }
              value={validatedLabel ?? "—"}
            />
          </>
        ) : null}
      </dl>
    </div>
  );
}
