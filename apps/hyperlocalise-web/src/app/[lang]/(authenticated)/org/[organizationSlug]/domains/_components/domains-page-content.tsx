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
import { PlusIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import { FormattedMessage, useIntl } from "react-intl";

import { OrgNavLink } from "@/components/app-shell/org-nav-link";
import { buildDomainPath } from "@/components/app-shell/navigation-config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TypographyP } from "@/components/ui/typography";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { useOrgRouter } from "@/lib/navigation/use-org-router";
import { cn } from "@/lib/primitives/cn";

import { WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { DomainsPageStoreProvider, useDomainsPageStore } from "../store/domains-store-context";
import { DomainsPageQueryBridge, linkedDomainsQueryKey } from "../store/domains-page-query-bridge";

import { AddDomainDialog } from "./add-domain-dialog";
import { DomainResearchEmpty } from "./domain-research-empty";
import { DomainStatusBadge } from "./domain-status-badge";
import { domainsPageContentMessages as messages } from "./domains-page-content.messages";

import styles from "./domain-header.module.css";

const LIST_GRID_CLASS =
  "grid grid-cols-1 items-center gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_4rem_auto_auto]";

export function DomainsPageContent({
  organizationSlug,
  allowLinkDomains,
  initialDomainSlug,
}: {
  organizationSlug: string;
  allowLinkDomains: boolean;
  initialDomainSlug?: string;
}) {
  return (
    <DomainsPageStoreProvider organizationSlug={organizationSlug}>
      <DomainsPageQueryBridge />
      <DomainsPageView allowLinkDomains={allowLinkDomains} initialDomainSlug={initialDomainSlug} />
    </DomainsPageStoreProvider>
  );
}

const DomainsPageView = observer(function DomainsPageView({
  allowLinkDomains,
  initialDomainSlug,
}: {
  allowLinkDomains: boolean;
  initialDomainSlug?: string;
}) {
  const intl = useIntl();
  const router = useOrgRouter();
  const queryClient = useQueryClient();
  const { client: goSvcClient } = useGoSvcClient();
  const store = useDomainsPageStore();
  const openedClaimRef = useRef(false);

  useEffect(() => {
    if (!allowLinkDomains || !initialDomainSlug || openedClaimRef.current) return;
    openedClaimRef.current = true;
    store.openAddDomainDialog();
    router.replace(`/org/${store.organizationSlug}/domains`, { scroll: false });
  }, [allowLinkDomains, initialDomainSlug, router, store]);
  const projectsQuery = useQuery({
    queryKey: ["translation-projects", store.organizationSlug, "domain-link"],
    enabled: allowLinkDomains && store.addDomainDialogOpen,
    queryFn: async () => {
      try {
        const body = await goSvcClient.project.list(store.organizationSlug);
        return body.projects.map((project) => ({ id: project.id, name: project.name }));
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, "Failed to load projects"), { cause: error });
      }
    },
  });

  const addDomainAction = allowLinkDomains ? (
    <Button type="button" size="sm" onClick={() => store.openAddDomainDialog()}>
      <PlusIcon />
      Add a domain
    </Button>
  ) : undefined;

  return (
    <WorkspacePageShell>
      <div className={styles.header}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-medium tracking-tight text-foreground">
            <FormattedMessage {...messages.pageTitle} />
          </h1>
          {store.hasDomains ? addDomainAction : null}
        </div>
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
              action={addDomainAction}
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
                    {allowLinkDomains && domain.status === "verified" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        onClick={() => {
                          const linkedDomain = store.linkedDomainById(domain.id);
                          if (linkedDomain) store.openEditLocales(linkedDomain);
                        }}
                      >
                        <FormattedMessage {...messages.editLocales} />
                      </Button>
                    ) : null}
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
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {allowLinkDomains ? (
        <AddDomainDialog
          open={store.addDomainDialogOpen}
          onOpenChange={(open) => store.setAddDomainDialogOpen(open)}
          organizationSlug={store.organizationSlug}
          mode={store.editLinkedDomain ? "edit" : "create"}
          initialStep={store.editLinkedDomain ? "markets" : "details"}
          initialLinkedDomain={store.editLinkedDomain ?? undefined}
          initialSelectedMarketIds={store.editLinkedDomain?.marketIds ?? []}
          initialDomainSlug={store.editLinkedDomain ? undefined : initialDomainSlug}
          existingDomains={store.domains}
          projects={projectsQuery.data ?? []}
          projectsLoading={projectsQuery.isPending}
          onComplete={() => {
            void queryClient.invalidateQueries({
              queryKey: linkedDomainsQueryKey(store.organizationSlug),
            });
            if (!store.editLinkedDomain) {
              router.push(`/org/${store.organizationSlug}/domains`);
            }
          }}
          onVerified={(domain) => {
            void queryClient.invalidateQueries({
              queryKey: linkedDomainsQueryKey(store.organizationSlug),
            });
            router.push(buildDomainPath(store.organizationSlug, domain.id, "overview"));
          }}
        />
      ) : null}
    </WorkspacePageShell>
  );
});
