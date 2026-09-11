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
import { type ReactNode, useId } from "react";
import { Globe02Icon } from "@hugeicons/core-free-icons";
import { observer } from "mobx-react-lite";
import { FormattedMessage, useIntl } from "react-intl";

import { DomainResearchContext } from "./domain-research-context";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { TypographyP } from "@/components/ui/typography";
import type { DomainResearchNavId } from "@/lib/domains/research-prototype";
import { useOrgRouter } from "@/lib/navigation/use-org-router";

import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { OrgNavLink } from "@/components/app-shell/org-nav-link";
import {
  DomainResearchShellStoreProvider,
  useDomainResearchShellStore,
} from "../store/domains-store-context";
import { DomainResearchQueryBridge } from "../store/domain-research-query-bridge";
import { DomainResearchShellUrlSync } from "../store/domain-research-shell-url-sync";

import { DomainResearchEmpty, DomainResearchMissingDomain } from "./domain-research-empty";
import { DomainStatusBadge } from "./domain-status-badge";
import { domainResearchSharedMessages as sharedMessages } from "./domain-research-shared.messages";
import { domainResearchShellMessages as messages } from "./domain-research-shell.messages";

import styles from "./domain-header.module.css";

export function DomainResearchShell({
  organizationSlug,
  linkedDomainId,
  surface,
  children,
}: {
  organizationSlug: string;
  linkedDomainId: string;
  surface: DomainResearchNavId;
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
      <DomainResearchShellView>{children}</DomainResearchShellView>
    </DomainResearchShellStoreProvider>
  );
}

const DomainResearchShellView = observer(function DomainResearchShellView({
  children,
}: {
  children: ReactNode;
}) {
  const intl = useIntl();
  const router = useOrgRouter();
  const store = useDomainResearchShellStore();
  const localeSelectId = useId();

  const domain = store.domain;
  const locale = store.locale;

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

  if (!domain || !locale) {
    return (
      <WorkspacePageShell>
        <DomainResearchMissingDomain organizationSlug={store.organizationSlug} />
      </WorkspacePageShell>
    );
  }

  const verifyHref = store.verifyHref;

  function changeLocale(nextLocaleId: string) {
    router.replace(store.hrefForLocale(nextLocaleId), { scroll: false });
  }

  return (
    <WorkspacePageShell className="gap-5">
      <div className={styles.header}>
        <PageHeader
          icon={Globe02Icon}
          label={intl.formatMessage(messages.sectionLabel)}
          title={domain.domainKey}
          description={intl.formatMessage(messages.shellDescription, {
            count: domain.locales.length,
          })}
          actions={
            <>
              <DomainStatusBadge status={domain.status} />
              {store.isPending && verifyHref ? (
                <Button size="sm" render={<OrgNavLink href={verifyHref} />}>
                  <FormattedMessage {...sharedMessages.verifyCta} />
                </Button>
              ) : null}
            </>
          }
        />
      </div>

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
        <p className="text-sm text-muted-foreground">
          <FormattedMessage {...messages.localeScope} />
        </p>
      </div>

      {store.isPending ? (
        <DomainResearchEmpty
          title={<FormattedMessage {...sharedMessages.pendingTitle} />}
          description={<FormattedMessage {...sharedMessages.pendingDescription} />}
          action={
            verifyHref ? (
              <Button size="sm" render={<OrgNavLink href={verifyHref} />}>
                <FormattedMessage {...sharedMessages.verifyCta} />
              </Button>
            ) : undefined
          }
        />
      ) : store.showResearchContent && store.activeCatalog ? (
        <DomainResearchContext
          value={store.activeCatalog}
          key={`${store.linkedDomainId}-${locale.id}`}
        >
          {children}
        </DomainResearchContext>
      ) : store.showLocaleEmpty ? (
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
    </WorkspacePageShell>
  );
});
