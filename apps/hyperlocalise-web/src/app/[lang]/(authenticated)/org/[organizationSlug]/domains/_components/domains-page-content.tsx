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
import { Globe02Icon } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TypographyP } from "@/components/ui/typography";
import type { LinkedDomainPublic } from "@/lib/linked-domains/types";

import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";

import { domainsPageContentMessages as messages } from "./domains-page-content.messages";

function statusLabel(
  status: LinkedDomainPublic["status"],
  intl: ReturnType<typeof useIntl>,
): string {
  switch (status) {
    case "pending_verification":
      return intl.formatMessage(messages.statusPending);
    case "verified":
      return intl.formatMessage(messages.statusVerified);
    case "failed":
      return intl.formatMessage(messages.statusFailed);
    case "revoked":
      return intl.formatMessage(messages.statusRevoked);
    default:
      return status;
  }
}

export function DomainsPageContent({ organizationSlug }: { organizationSlug: string }) {
  const intl = useIntl();
  const domainsQuery = useQuery({
    queryKey: ["linked-domains", organizationSlug],
    queryFn: async () => {
      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains`,
      );
      const body = (await response.json().catch(() => ({}))) as {
        linkedDomains?: LinkedDomainPublic[];
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.message || body.error || intl.formatMessage(messages.loadError));
      }
      return body.linkedDomains ?? [];
    },
  });

  const linkedDomains = domainsQuery.data ?? [];

  return (
    <WorkspacePageShell>
      <PageHeader
        icon={Globe02Icon}
        label="Workspace"
        title="Domains"
        description={intl.formatMessage(messages.pageDescription)}
      />

      {domainsQuery.isError ? (
        <TypographyP size="small" tone="critical">
          {domainsQuery.error instanceof Error
            ? domainsQuery.error.message
            : intl.formatMessage(messages.loadError)}
        </TypographyP>
      ) : null}

      {domainsQuery.isLoading ? (
        <TypographyP size="small" tone="subtle">
          <FormattedMessage {...messages.loading} />
        </TypographyP>
      ) : null}

      {!domainsQuery.isLoading && !domainsQuery.isError && linkedDomains.length === 0 ? (
        <TypographyP size="small" tone="subtle">
          <FormattedMessage {...messages.empty} />
        </TypographyP>
      ) : null}

      {linkedDomains.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {linkedDomains.map((domain) => (
            <li
              key={domain.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0 space-y-1">
                <Link
                  href={`/org/${organizationSlug}/domains/${domain.id}`}
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {domain.domainKey}
                </Link>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline">{statusLabel(domain.status, intl)}</Badge>
                  <span>
                    {domain.auditScore != null
                      ? intl.formatMessage(messages.scoreLabel, { score: domain.auditScore })
                      : intl.formatMessage(messages.scoreUnavailable)}
                  </span>
                  {domain.verifiedMethod ? <span>· {domain.verifiedMethod}</span> : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={`/org/${organizationSlug}/domains/${domain.id}`} />}
                >
                  <FormattedMessage {...messages.viewReport} />
                </Button>
                {domain.status !== "verified" ? (
                  <Button
                    size="sm"
                    nativeButton={false}
                    render={
                      <Link href={`/org/${organizationSlug}/link-domain/${domain.domainSlug}`} />
                    }
                  >
                    <FormattedMessage {...messages.continueVerification} />
                  </Button>
                ) : null}
                {domain.projectId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    render={<Link href={`/org/${organizationSlug}/projects/${domain.projectId}`} />}
                  >
                    <FormattedMessage {...messages.openProject} />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </WorkspacePageShell>
  );
}
