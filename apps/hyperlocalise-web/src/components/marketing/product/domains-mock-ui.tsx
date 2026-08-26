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
import { useMemo, useState, type ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { SEAFOAM_MESH_GRADIENT_SRC } from "@/components/marketing/hero-frame-mesh-stage";
import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import { domainsMockMessages } from "./domains-mock-ui.messages";
import {
  MarketingMockShell,
  type MarketingMockMeshPosition,
  type MarketingMockVariant,
} from "./marketing-mock-shell";
import { MarketingMockUseCaseSelector } from "./marketing-mock-use-case-selector";

type AuditFocus = "localisation" | "seo" | "aeo";

function DomainsAuditDashboard({ focus }: { focus: AuditFocus }) {
  const intl = useIntl();

  const dimensions = useMemo(
    () => [
      {
        id: "localisation" as const,
        label: intl.formatMessage(domainsMockMessages.dimensionLocalisation),
        value: 64,
        tone: "watch" as const,
      },
      {
        id: "seo" as const,
        label: intl.formatMessage(domainsMockMessages.dimensionSeo),
        value: 78,
        tone: "info" as const,
      },
      {
        id: "aeo" as const,
        label: intl.formatMessage(domainsMockMessages.dimensionAeo),
        value: 71,
        tone: "info" as const,
      },
    ],
    [intl],
  );

  const issues = useMemo(
    () => [
      {
        id: "localisation" as const,
        message: intl.formatMessage(domainsMockMessages.issueHreflang),
      },
      {
        id: "seo" as const,
        message: intl.formatMessage(domainsMockMessages.issueMeta),
      },
      {
        id: "aeo" as const,
        message: intl.formatMessage(domainsMockMessages.issueAeo),
      },
    ],
    [intl],
  );

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl border border-border/80 bg-background/90 shadow-lg backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-foreground">
            <FormattedMessage {...domainsMockMessages.auditPanelTitle} />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            <FormattedMessage {...domainsMockMessages.lastRunLabel} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-medium tracking-wide uppercase text-muted-foreground">
            <FormattedMessage {...domainsMockMessages.overallScore} />
          </div>
          <div className="font-heading text-3xl font-medium text-foreground">82</div>
          <div className="text-xs text-muted-foreground">
            <FormattedMessage {...domainsMockMessages.scoreDelta} />
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="space-y-3">
          {dimensions.map((dimension) => {
            const isFocused = dimension.id === focus;
            return (
              <div
                key={dimension.id}
                className={cn(
                  "space-y-1.5 rounded-lg border px-3 py-2.5 transition-colors",
                  isFocused ? "border-primary/35 bg-primary/5" : "border-transparent",
                )}
              >
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span
                    className={cn(
                      isFocused ? "font-medium text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {dimension.label}
                  </span>
                  <span className="font-medium text-foreground">{dimension.value}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-border/50">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      dimension.tone === "watch" && "bg-bud-500",
                      dimension.tone === "info" && "bg-dew-500",
                    )}
                    style={{ width: `${dimension.value}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-border/50 pt-3">
          <div className="mb-2 text-xs font-semibold text-foreground">
            <FormattedMessage {...domainsMockMessages.issuesTitle} />
          </div>
          <ul className="space-y-2 text-xs leading-relaxed">
            {issues.map((issue) => (
              <li
                key={issue.id}
                className={cn(
                  "rounded-md px-2 py-1.5",
                  issue.id === focus
                    ? "border border-destructive/25 bg-destructive/10 text-destructive dark:border-destructive/30 dark:bg-destructive/20 dark:text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function DomainsMockUI({
  priority = false,
  pauseAutoplay: _pauseAutoplay = false,
  renderCta,
  variant = "full",
  aside,
  meshPosition = "left",
}: {
  priority?: boolean;
  pauseAutoplay?: boolean;
  renderCta?: () => ReactNode;
  variant?: MarketingMockVariant;
  aside?: ReactNode;
  meshPosition?: MarketingMockMeshPosition;
}) {
  const intl = useIntl();

  const useCases = useMemo(
    () => [
      {
        id: "localisation",
        title: intl.formatMessage(domainsMockMessages.useCaseLocalisationTitle),
        description: intl.formatMessage(domainsMockMessages.useCaseLocalisationDescription),
      },
      {
        id: "seo",
        title: intl.formatMessage(domainsMockMessages.useCaseSeoTitle),
        description: intl.formatMessage(domainsMockMessages.useCaseSeoDescription),
      },
      {
        id: "aeo",
        title: intl.formatMessage(domainsMockMessages.useCaseAeoTitle),
        description: intl.formatMessage(domainsMockMessages.useCaseAeoDescription),
      },
    ],
    [intl],
  );

  const focusByUseCase: Record<string, AuditFocus> = {
    localisation: "localisation",
    seo: "seo",
    aeo: "aeo",
  };

  const [activeId, setActiveId] = useState(useCases[0]?.id ?? "localisation");
  const focus = focusByUseCase[activeId] ?? "localisation";

  const sidebar =
    variant === "full" ? (
      <MarketingMockUseCaseSelector
        eyebrow={domainsMockMessages.eyebrow}
        headline={domainsMockMessages.headline}
        useCases={useCases}
        activeId={activeId}
        onSelect={setActiveId}
        cta={
          renderCta === undefined ? (
            <Button
              variant="outline"
              size="lg"
              nativeButton={false}
              render={<a href={REQUEST_DEMO_URL} target="_blank" rel="noopener noreferrer" />}
              className="cursor-pointer rounded-sm"
            >
              <FormattedMessage {...domainsMockMessages.requestDemo} />
            </Button>
          ) : (
            renderCta()
          )
        }
      />
    ) : undefined;

  return (
    <MarketingMockShell
      visual={<DomainsAuditDashboard focus={focus} />}
      sidebar={sidebar}
      aside={aside}
      meshSrc={SEAFOAM_MESH_GRADIENT_SRC}
      priority={priority}
      variant={variant}
      meshPosition={meshPosition}
    />
  );
}
