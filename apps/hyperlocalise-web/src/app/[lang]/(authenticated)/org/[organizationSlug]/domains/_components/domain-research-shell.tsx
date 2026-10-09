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
import { type ReactNode, useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { observer } from "mobx-react-lite";
import { FormattedMessage } from "react-intl";

import { DomainResearchContext } from "./domain-research-context";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TypographyP } from "@/components/ui/typography";
import { getResearchMarket, type DomainResearchNavId } from "@/lib/domains/research-prototype";
import type { LinkedDomainPublic } from "@/lib/linked-domains/types";
import { useOrgRouter } from "@/lib/navigation/use-org-router";

import { WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { linkedDomainsQueryKey } from "../store/domains-page-query-bridge";
import {
  DomainResearchShellStoreProvider,
  useDomainResearchShellStore,
} from "../store/domains-store-context";
import { DomainResearchQueryBridge } from "../store/domain-research-query-bridge";
import { DomainResearchShellUrlSync } from "../store/domain-research-shell-url-sync";

import { AddDomainDialog } from "./add-domain-dialog";
import { DomainResearchEmpty, DomainResearchMissingDomain } from "./domain-research-empty";
import { DomainStatusBadge } from "./domain-status-badge";
import { liveDomainResearchQueryKey } from "./use-live-domain-research";
import { domainResearchSharedMessages as sharedMessages } from "./domain-research-shared.messages";
import { domainResearchShellMessages as messages } from "./domain-research-shell.messages";

import styles from "./domain-header.module.css";

export function DomainResearchShell({
  organizationSlug,
  linkedDomainId,
  surface,
  canEditLocales = false,
  children,
}: {
  organizationSlug: string;
  linkedDomainId: string;
  surface: DomainResearchNavId;
  canEditLocales?: boolean;
  children: ReactNode;
}) {
  return (
    <DomainResearchShellStoreProvider
      organizationSlug={organizationSlug}
      linkedDomainId={linkedDomainId}
      surface={surface}
    >
      <DomainResearchQueryBridge />
      <DomainResearchShellUrlSync />
      <DomainResearchShellView canEditLocales={canEditLocales}>{children}</DomainResearchShellView>
    </DomainResearchShellStoreProvider>
  );
}

const DomainResearchShellView = observer(function DomainResearchShellView({
  canEditLocales,
  children,
}: {
  canEditLocales: boolean;
  children: ReactNode;
}) {
  const router = useOrgRouter();
  const queryClient = useQueryClient();
  const store = useDomainResearchShellStore();
  const localeSelectId = useId();
  const [editLocalesOpen, setEditLocalesOpen] = useState(false);

  const domain = store.domain;
  const locale = store.locale;
  const showNoLocalesState =
    !store.isPending && domain && domain.locales.length === 0 && !store.showSearchConsoleSurface;

  if (store.loadStatus === "loading") {
    return (
      <WorkspacePageShell>
        <TypographyP size="small" tone="subtle">
          <FormattedMessage {...messages.loading} />
        </TypographyP>
      </WorkspacePageShell>
    );
  }

  if (store.loadStatus === "error") {
    return (
      <WorkspacePageShell>
        <TypographyP size="small" tone="subtle">
          <FormattedMessage {...messages.loadError} />
        </TypographyP>
      </WorkspacePageShell>
    );
  }

  if (!domain) {
    return (
      <WorkspacePageShell>
        <DomainResearchMissingDomain organizationSlug={store.organizationSlug} />
      </WorkspacePageShell>
    );
  }

  function changeLocale(nextLocaleId: string) {
    router.replace(store.hrefForLocale(nextLocaleId), { scroll: false });
  }

  function handleLocalesSaved(updated: LinkedDomainPublic) {
    const org = store.organizationSlug;
    const id = store.linkedDomainId;
    queryClient.setQueryData(liveDomainResearchQueryKey(org, id), (current) =>
      current ? { ...current, linkedDomain: updated } : current,
    );
    void queryClient.invalidateQueries({ queryKey: liveDomainResearchQueryKey(org, id) });
    void queryClient.invalidateQueries({ queryKey: linkedDomainsQueryKey(org) });

    const savedIds = updated.marketIds.filter((marketId) => getResearchMarket(marketId));
    const requested = store.requestedLocaleId;
    if (requested && !savedIds.includes(requested)) {
      router.replace(savedIds[0] ? store.hrefForLocale(savedIds[0]) : store.hrefWithoutLocale(), {
        scroll: false,
      });
    }
  }

  const canOpenEditLocales =
    canEditLocales && store.linkedDomain?.status === "verified" && Boolean(store.linkedDomain);

  return (
    <WorkspacePageShell className="gap-5">
      <div className={styles.header}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <FormattedMessage {...messages.sectionLabel} />
            </p>
            <h1 className="truncate text-2xl font-medium tracking-tight text-foreground">
              {domain.domainKey}
            </h1>
          </div>
          <DomainStatusBadge status={domain.status} />
        </div>
      </div>

      {locale ? (
        <div className="flex flex-wrap items-end gap-3">
          <Field className="w-full sm:w-72">
            <FieldLabel htmlFor={localeSelectId}>
              <FormattedMessage {...messages.localeLabel} />
            </FieldLabel>
            <Select
              value={locale.id}
              items={domain.locales.map((item) => ({ value: item.id, label: item.label }))}
              onValueChange={(value) => {
                if (value) changeLocale(value);
              }}
            >
              <SelectTrigger id={localeSelectId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {domain.locales.map((item) => (
                    <SelectItem key={item.id} value={item.id} label={item.label}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {canOpenEditLocales ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditLocalesOpen(true)}
            >
              <FormattedMessage {...messages.editLocales} />
            </Button>
          ) : null}
          <p className="text-sm text-muted-foreground">
            <FormattedMessage {...messages.localeScope} />
          </p>
        </div>
      ) : showNoLocalesState ? (
        <DomainResearchEmpty
          title={<FormattedMessage {...messages.noLocalesTitle} />}
          description={<FormattedMessage {...messages.noLocalesDescription} />}
          action={
            canOpenEditLocales ? (
              <Button type="button" size="sm" onClick={() => setEditLocalesOpen(true)}>
                <FormattedMessage {...messages.editLocales} />
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {store.isPending ? (
        <DomainResearchEmpty
          title={<FormattedMessage {...sharedMessages.pendingTitle} />}
          description={<FormattedMessage {...sharedMessages.pendingDescription} />}
        />
      ) : store.showSearchConsoleSurface ? (
        children
      ) : store.showResearchContent && store.activeCatalog && locale ? (
        <DomainResearchContext
          value={store.activeCatalog}
          key={`${store.linkedDomainId}-${locale.id}`}
        >
          {children}
        </DomainResearchContext>
      ) : store.showLocaleEmpty && locale ? (
        <DomainResearchEmpty
          title={<FormattedMessage {...messages.localeEmptyTitle} />}
          description={
            <FormattedMessage
              {...messages.localeEmptyDescription}
              values={{ locale: locale.label }}
            />
          }
        />
      ) : null}

      {canOpenEditLocales && store.linkedDomain ? (
        <AddDomainDialog
          open={editLocalesOpen}
          onOpenChange={setEditLocalesOpen}
          organizationSlug={store.organizationSlug}
          mode="edit"
          initialStep="markets"
          initialLinkedDomain={store.linkedDomain}
          initialSelectedMarketIds={store.linkedDomain.marketIds}
          onComplete={handleLocalesSaved}
        />
      ) : null}
    </WorkspacePageShell>
  );
});
