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
import { useState } from "react";
import { Add01Icon, Globe02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { OrgNavLink } from "@/components/app-shell/org-nav-link";
import { buildDomainPath } from "@/components/app-shell/navigation-config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  isLiveDomainResearchId,
  linkedDomainToResearchDomain,
  type DomainResearchDomain,
} from "@/lib/domains/research-prototype";
import type { LinkedDomainPublic } from "@/lib/linked-domains/types";
import { useDomainPrototype } from "./use-domain-prototype";
import { cn } from "@/lib/primitives/cn";

import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";

import { DomainLinkDialog } from "./domain-link-dialog";
import { DomainStatusBadge } from "./domain-status-badge";
import { DomainVerifyDialog } from "./domain-verify-dialog";
import { domainsPageContentMessages as messages } from "./domains-page-content.messages";

import styles from "./domain-header.module.css";

const LIST_GRID_CLASS =
  "grid grid-cols-1 items-center gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_4rem_auto_auto]";

export function DomainsPageContent({ organizationSlug }: { organizationSlug: string }) {
  const intl = useIntl();
  const { domains: prototypeDomains, saveDomain } = useDomainPrototype(organizationSlug);
  const linkedDomainsQuery = useQuery({
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
      return (body.linkedDomains ?? []).map((domain) => linkedDomainToResearchDomain(domain));
    },
  });
  const liveDomains = linkedDomainsQuery.data ?? [];
  const domains: DomainResearchDomain[] =
    liveDomains.length > 0 ? liveDomains : prototypeDomains;
  const [editingDomain, setEditingDomain] = useState<DomainResearchDomain | undefined>();
  const [linkOpen, setLinkOpen] = useState(false);
  const [verifyDomainKey, setVerifyDomainKey] = useState<string | null>(null);

  return (
    <WorkspacePageShell>
      <div className={styles.header}>
        <PageHeader
          icon={Globe02Icon}
          label="Workspace"
          title="Domains"
          description={intl.formatMessage(messages.pageDescription)}
          actions={
            <Button size="sm" onClick={() => setLinkOpen(true)}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
              <FormattedMessage {...messages.linkDomain} />
            </Button>
          }
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div
          className={cn(
            LIST_GRID_CLASS,
            "hidden border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground md:grid",
          )}
        >
          <span>
            <FormattedMessage {...messages.columnDomain} />
          </span>
          <span>
            <FormattedMessage {...messages.columnLocales} />
          </span>
          <span className="text-end">
            <FormattedMessage {...messages.columnScore} />
          </span>
          <span />
          <span />
        </div>
        <ul className="divide-y divide-border">
          {domains.map((domain) => (
            <li key={domain.id}>
              <div
                className={cn(LIST_GRID_CLASS, "hover:bg-blue-100/50 focus-within:bg-blue-100/50")}
              >
                <div className="min-w-0">
                  <OrgNavLink
                    href={buildDomainPath(organizationSlug, domain.id, "overview")}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {domain.domainKey}
                  </OrgNavLink>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {domain.locales.map((locale) => (
                    <Badge key={locale.id} variant="secondary">
                      {locale.label}
                    </Badge>
                  ))}
                </div>
                <span className="hidden text-end tabular-nums text-sm text-muted-foreground md:block">
                  {domain.score ?? intl.formatMessage(messages.scoreUnavailable)}
                </span>
                <DomainStatusBadge status={domain.status} />
                <div className="flex flex-wrap justify-end gap-2">
                  {isLiveDomainResearchId(domain.id) ? null : (
                    <Button size="sm" variant="ghost" onClick={() => setEditingDomain(domain)}>
                      <FormattedMessage {...messages.editLocales} />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    render={
                      <OrgNavLink href={buildDomainPath(organizationSlug, domain.id, "overview")} />
                    }
                  >
                    <FormattedMessage {...messages.openDomain} />
                  </Button>
                  {domain.status !== "verified" ? (
                    <Button size="sm" onClick={() => setVerifyDomainKey(domain.domainKey)}>
                      <FormattedMessage {...messages.continueVerification} />
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <DomainLinkDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        existingDomains={domains}
        onSave={(domain) => {
          saveDomain(domain);
          setVerifyDomainKey(domain.domainKey);
        }}
      />
      <DomainLinkDialog
        open={Boolean(editingDomain)}
        domain={editingDomain}
        onOpenChange={(open) => {
          if (!open) setEditingDomain(undefined);
        }}
        onSave={saveDomain}
      />
      <DomainVerifyDialog
        open={Boolean(verifyDomainKey)}
        domainKey={verifyDomainKey ?? ""}
        onOpenChange={(open) => {
          if (!open) {
            setVerifyDomainKey(null);
          }
        }}
      />
    </WorkspacePageShell>
  );
}
