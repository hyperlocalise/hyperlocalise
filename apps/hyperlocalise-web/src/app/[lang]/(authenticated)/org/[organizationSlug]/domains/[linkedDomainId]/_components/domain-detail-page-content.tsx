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
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft01Icon, Globe02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { LocalisationAuditResult } from "@/components/marketing/localisation-audit/localisation-audit-result";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { getAppLocaleFromPathname } from "@/lib/app-i18n/rewrite-app-locale-path";
import type { LinkedDomainAuditDetail, LinkedDomainPublic } from "@/lib/linked-domains/types";

import { PageHeader, WorkspacePageShell } from "../../../_components/workspace-resource-shared";

import { domainDetailPageContentMessages as messages } from "./domain-detail-page-content.messages";

export function DomainDetailPageContent({
  organizationSlug,
  linkedDomainId,
}: {
  organizationSlug: string;
  linkedDomainId: string;
}) {
  const intl = useIntl();
  const pathname = usePathname();
  const locale = getAppLocaleFromPathname(pathname ?? "/");

  const domainQuery = useQuery({
    queryKey: ["linked-domain", organizationSlug, linkedDomainId],
    queryFn: async () => {
      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains/${encodeURIComponent(linkedDomainId)}`,
      );
      const body = (await response.json().catch(() => ({}))) as {
        linkedDomain?: LinkedDomainPublic;
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.message || body.error || intl.formatMessage(messages.loadError));
      }
      if (!body.linkedDomain) {
        throw new Error(intl.formatMessage(messages.loadError));
      }
      return body.linkedDomain;
    },
  });

  const auditQuery = useQuery({
    queryKey: ["linked-domain-audit", organizationSlug, linkedDomainId],
    enabled:
      Boolean(domainQuery.data?.localisationAuditId) && domainQuery.data?.status === "verified",
    queryFn: async () => {
      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains/${encodeURIComponent(linkedDomainId)}/audit`,
      );
      const body = (await response.json().catch(() => ({}))) as {
        audit?: LinkedDomainAuditDetail;
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.message || body.error || intl.formatMessage(messages.auditLoadError));
      }
      if (!body.audit) {
        throw new Error(intl.formatMessage(messages.auditLoadError));
      }
      return body.audit;
    },
  });

  const linkedDomain = domainQuery.data;

  return (
    <WorkspacePageShell className="max-w-5xl">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-2"
          nativeButton={false}
          render={<Link href={`/org/${organizationSlug}/domains`} />}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.7} className="size-4" />
          <FormattedMessage {...messages.backToDomains} />
        </Button>
      </div>

      {domainQuery.isLoading ? (
        <TypographyP size="small" tone="subtle">
          <FormattedMessage {...messages.loading} />
        </TypographyP>
      ) : null}

      {domainQuery.isError ? (
        <TypographyP size="small" tone="critical">
          {domainQuery.error instanceof Error
            ? domainQuery.error.message
            : intl.formatMessage(messages.loadError)}
        </TypographyP>
      ) : null}

      {linkedDomain ? (
        <>
          <PageHeader
            icon={Globe02Icon}
            label="Domains"
            title={linkedDomain.domainKey}
            description={linkedDomain.sourceUrl}
            actions={
              <div className="flex flex-wrap gap-2">
                {linkedDomain.status !== "verified" ? (
                  <Button
                    size="sm"
                    nativeButton={false}
                    render={
                      <Link
                        href={`/org/${organizationSlug}/link-domain/${linkedDomain.domainSlug}`}
                      />
                    }
                  >
                    <FormattedMessage {...messages.continueVerification} />
                  </Button>
                ) : null}
                {linkedDomain.projectId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    render={
                      <Link href={`/org/${organizationSlug}/projects/${linkedDomain.projectId}`} />
                    }
                  >
                    <FormattedMessage {...messages.openProject} />
                  </Button>
                ) : null}
              </div>
            }
          />

          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>
              <FormattedMessage {...messages.statusLabel} />
            </span>
            <Badge variant="outline">{linkedDomain.status.replaceAll("_", " ")}</Badge>
            {linkedDomain.auditScore != null ? (
              <span className="tabular-nums">Score {linkedDomain.auditScore}</span>
            ) : null}
          </div>

          <section className="space-y-4">
            <TypographyH2 className="pb-0" size="xlarge">
              <FormattedMessage {...messages.reportHeading} />
            </TypographyH2>

            {!linkedDomain.localisationAuditId ? (
              <TypographyP size="small" tone="subtle">
                <FormattedMessage {...messages.noAudit} />
              </TypographyP>
            ) : null}

            {linkedDomain.localisationAuditId && linkedDomain.status !== "verified" ? (
              <TypographyP size="small" tone="subtle">
                <FormattedMessage {...messages.verifyPending} />
              </TypographyP>
            ) : null}

            {auditQuery.isLoading ? (
              <TypographyP size="small" tone="subtle">
                <FormattedMessage {...messages.loading} />
              </TypographyP>
            ) : null}

            {auditQuery.isError ? (
              <TypographyP size="small" tone="critical">
                {auditQuery.error instanceof Error
                  ? auditQuery.error.message
                  : intl.formatMessage(messages.auditLoadError)}
              </TypographyP>
            ) : null}

            {auditQuery.data ? (
              <LocalisationAuditResult
                locale={locale}
                domainSlug={auditQuery.data.domainSlug}
                standing={null}
                variant="workspace"
                initialAudit={{
                  id: auditQuery.data.id,
                  domainKey: auditQuery.data.domainKey,
                  domainSlug: auditQuery.data.domainSlug,
                  sourceUrl: auditQuery.data.sourceUrl,
                  status: auditQuery.data.status,
                  score: auditQuery.data.score,
                  teaser: auditQuery.data.teaser,
                  report: auditQuery.data.report,
                  unlocked: auditQuery.data.report != null,
                  claimed: true,
                  errorCode: null,
                  completedAt: auditQuery.data.completedAt,
                }}
              />
            ) : null}
          </section>
        </>
      ) : null}
    </WorkspacePageShell>
  );
}
