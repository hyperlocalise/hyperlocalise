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
import { type ReactNode, useEffect, useId, useState } from "react";
import { Globe02Icon } from "@hugeicons/core-free-icons";
import { FormattedMessage, useIntl } from "react-intl";

import { useSearchParams } from "next/navigation";
import { DomainResearchContext } from "./domain-research-context";
import { useDomainPrototype } from "./use-domain-prototype";
import { DomainLinkDialog } from "./domain-link-dialog";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TypographyP } from "@/components/ui/typography";
import type { DomainResearchNavId, DomainResearchSurface } from "@/lib/domains/research-prototype";
import {
  filterCatalogForLocale,
  getResearchPrototypeCatalog,
  resolveDomainLocale,
  isDomainResearchSurface,
  isLiveDomainResearchId,
} from "@/lib/domains/research-prototype";
import { useOrgRouter } from "@/lib/navigation/use-org-router";

import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { buildDomainPath } from "@/components/app-shell/navigation-config";

import { DomainResearchEmpty, DomainResearchMissingDomain } from "./domain-research-empty";
import { DomainStatusBadge } from "./domain-status-badge";
import { domainResearchSharedMessages as sharedMessages } from "./domain-research-shared.messages";
import { domainResearchShellMessages as messages } from "./domain-research-shell.messages";
import { DomainVerifyDialog } from "./domain-verify-dialog";
import { useLiveDomainResearch } from "./use-live-domain-research";

import styles from "./domain-header.module.css";

const NAV_ITEMS: { id: DomainResearchNavId; message: typeof messages.navOverview }[] = [
  { id: "overview", message: messages.navOverview },
  { id: "keywords", message: messages.navKeywords },
  { id: "ranks", message: messages.navRanks },
  { id: "brand", message: messages.navBrand },
  { id: "prompts", message: messages.navPrompts },
];

function hrefForLocale({
  organizationSlug,
  linkedDomainId,
  surface,
  search,
  localeId,
}: {
  organizationSlug: string;
  linkedDomainId: string;
  surface?: DomainResearchNavId;
  search: string;
  localeId: string;
}) {
  const params = new URLSearchParams(search);
  params.set("locale", localeId);
  return `${buildDomainPath(organizationSlug, linkedDomainId, surface)}?${params}`;
}

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
  const intl = useIntl();
  const router = useOrgRouter();
  const live = isLiveDomainResearchId(linkedDomainId);
  const liveResearch = useLiveDomainResearch(live ? organizationSlug : undefined, linkedDomainId);
  const { domains, saveDomain } = useDomainPrototype(organizationSlug);
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const requestedLocaleId = searchParams.get("locale");
  const localeSelectId = useId();
  const [editOpen, setEditOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);

  const prototypeDomain = domains.find((item) => item.id === linkedDomainId);
  const domain = live ? (liveResearch.data?.catalog.domain ?? null) : (prototypeDomain ?? null);
  const locale = domain ? resolveDomainLocale(domain, requestedLocaleId) : null;
  const localeId = locale?.id;

  useEffect(() => {
    if (!localeId || requestedLocaleId === localeId) return;
    router.replace(hrefForLocale({ organizationSlug, linkedDomainId, surface, search, localeId }), {
      scroll: false,
    });
    // useOrgRouter() returns a new object each render; depending on it recanonicalizes forever
    // while the URL is still stale.
  }, [linkedDomainId, localeId, organizationSlug, requestedLocaleId, search, surface]);

  if (live && liveResearch.isPending) {
    return (
      <WorkspacePageShell>
        <TypographyP size="small" tone="subtle">
          <FormattedMessage {...messages.loading} />
        </TypographyP>
      </WorkspacePageShell>
    );
  }

  if (live && liveResearch.isError) {
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
        <DomainResearchMissingDomain organizationSlug={organizationSlug} />
      </WorkspacePageShell>
    );
  }

  const liveCatalog = liveResearch.data?.catalog;
  const catalog = live
    ? liveCatalog
      ? filterCatalogForLocale(liveCatalog, locale.id)
      : null
    : getResearchPrototypeCatalog(linkedDomainId, locale.id);
  const activeLocaleId = locale.id;

  function researchHref(nextLocaleId: string, nextSurface = surface) {
    return hrefForLocale({
      organizationSlug,
      linkedDomainId,
      surface: nextSurface,
      search,
      localeId: nextLocaleId,
    });
  }

  function changeLocale(nextLocaleId: string) {
    router.replace(researchHref(nextLocaleId), { scroll: false });
  }

  function handleSurfaceChange(next: string) {
    const nextSurface: DomainResearchSurface | undefined = isDomainResearchSurface(next)
      ? next
      : undefined;
    router.push(researchHref(activeLocaleId, nextSurface));
  }

  const isPending = domain.status !== "verified";

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
              {isPending ? (
                <Button size="sm" onClick={() => setVerifyOpen(true)}>
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
        {live ? null : (
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <FormattedMessage {...messages.editLocales} />
          </Button>
        )}
        <p className="text-sm text-muted-foreground">
          <FormattedMessage {...messages.localeScope} />
        </p>
      </div>

      <Tabs value={surface} onValueChange={handleSurfaceChange}>
        <TabsList variant="line" className="w-full max-w-full justify-start overflow-x-auto">
          {NAV_ITEMS.map((item) => (
            <TabsTrigger key={item.id} value={item.id}>
              <FormattedMessage {...item.message} />
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isPending ? (
        <DomainResearchEmpty
          title={<FormattedMessage {...sharedMessages.pendingTitle} />}
          description={<FormattedMessage {...sharedMessages.pendingDescription} />}
          action={
            <Button size="sm" onClick={() => setVerifyOpen(true)}>
              <FormattedMessage {...sharedMessages.verifyCta} />
            </Button>
          }
        />
      ) : catalog ? (
        <DomainResearchContext value={catalog} key={`${linkedDomainId}-${locale.id}`}>
          {children}
        </DomainResearchContext>
      ) : (
        <DomainResearchEmpty
          title={<FormattedMessage {...messages.localeEmptyTitle} />}
          description={
            <FormattedMessage
              {...messages.localeEmptyDescription}
              values={{ locale: locale.label }}
            />
          }
          action={
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <FormattedMessage {...messages.editLocales} />
            </Button>
          }
        />
      )}
      {live ? null : (
        <DomainLinkDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          domain={domain}
          onSave={saveDomain}
        />
      )}

      <DomainVerifyDialog
        open={verifyOpen}
        domainKey={domain.domainKey}
        onOpenChange={setVerifyOpen}
      />
    </WorkspacePageShell>
  );
}
