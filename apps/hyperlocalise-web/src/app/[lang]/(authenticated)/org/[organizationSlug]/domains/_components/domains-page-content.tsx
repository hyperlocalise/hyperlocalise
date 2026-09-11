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
import { Add01Icon, Globe02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { observer } from "mobx-react-lite";
import { FormattedMessage, useIntl } from "react-intl";

import { OrgNavLink } from "@/components/app-shell/org-nav-link";
import { buildDomainPath } from "@/components/app-shell/navigation-config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TypographyP } from "@/components/ui/typography";
import { useOrgRouter } from "@/lib/navigation/use-org-router";
import { cn } from "@/lib/primitives/cn";

import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { DomainsPageStoreProvider, useDomainsPageStore } from "../store/domains-store-context";
import { DomainsPageQueryBridge } from "../store/domains-page-query-bridge";

import { DomainLinkDialog } from "./domain-link-dialog";
import { DomainResearchEmpty } from "./domain-research-empty";
import { DomainStatusBadge } from "./domain-status-badge";
import { domainsPageContentMessages as messages } from "./domains-page-content.messages";

import styles from "./domain-header.module.css";

const LIST_GRID_CLASS =
  "grid grid-cols-1 items-center gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_4rem_auto_auto]";

export function DomainsPageContent({ organizationSlug }: { organizationSlug: string }) {
  return (
    <DomainsPageStoreProvider organizationSlug={organizationSlug}>
      <DomainsPageQueryBridge />
      <DomainsPageView />
    </DomainsPageStoreProvider>
  );
}

const DomainsPageView = observer(function DomainsPageView() {
  const intl = useIntl();
  const router = useOrgRouter();
  const store = useDomainsPageStore();

  const linkDomainAction = (
    <Button type="button" size="sm" onClick={() => store.openLinkDialog()}>
      <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
      <FormattedMessage {...messages.linkDomain} />
    </Button>
  );

  return (
    <WorkspacePageShell>
      <div className={styles.header}>
        <PageHeader
          icon={Globe02Icon}
          label="Workspace"
          title="Domains"
          description={intl.formatMessage(messages.pageDescription)}
          actions={store.hasDomains ? linkDomainAction : undefined}
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {store.hasDomains ? (
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
        ) : null}
        {store.isLoading ? (
          <TypographyP className="px-4 py-6" size="small" tone="subtle">
            <FormattedMessage {...messages.loading} />
          </TypographyP>
        ) : store.isError ? (
          <TypographyP className="px-4 py-6" size="small" tone="subtle">
            <FormattedMessage {...messages.loadError} />
          </TypographyP>
        ) : store.isEmpty ? (
          <div className="p-4">
            <DomainResearchEmpty
              title={<FormattedMessage {...messages.emptyTitle} />}
              description={<FormattedMessage {...messages.emptyDescription} />}
              action={linkDomainAction}
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {store.domains.map((domain) => (
              <li key={domain.id}>
                <div
                  className={cn(
                    LIST_GRID_CLASS,
                    "hover:bg-blue-100/50 focus-within:bg-blue-100/50",
                  )}
                >
                  <div className="min-w-0">
                    <OrgNavLink
                      href={buildDomainPath(store.organizationSlug, domain.id, "overview")}
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
                    <Button
                      size="sm"
                      variant="outline"
                      render={
                        <OrgNavLink
                          href={buildDomainPath(store.organizationSlug, domain.id, "overview")}
                        />
                      }
                    >
                      <FormattedMessage {...messages.openDomain} />
                    </Button>
                    {domain.status !== "verified" && domain.domainSlug ? (
                      <Button
                        size="sm"
                        render={
                          <OrgNavLink
                            href={`/org/${store.organizationSlug}/link-domain/${domain.domainSlug}`}
                          />
                        }
                      >
                        <FormattedMessage {...messages.continueVerification} />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <DomainLinkDialog
        open={store.linkDialogOpen}
        onOpenChange={(open) => store.setLinkDialogOpen(open)}
        domain={store.linkDialogDomain}
        existingDomains={store.domains}
        onSave={(domain) => {
          if (store.editLocalesDomain) {
            return;
          }
          router.push(store.linkDomainPath(domain.domainKey));
        }}
      />
    </WorkspacePageShell>
  );
});
