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
import { type ReactNode, useState } from "react";
import { Globe02Icon } from "@hugeicons/core-free-icons";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TypographyP } from "@/components/ui/typography";
import type { DomainResearchNavId, DomainResearchSurface } from "@/lib/domains/research-prototype";
import {
  getResearchPrototypeDomain,
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
  const prototypeDomain = getResearchPrototypeDomain(linkedDomainId);
  const liveResearch = useLiveDomainResearch(
    isLiveDomainResearchId(linkedDomainId) ? organizationSlug : undefined,
    linkedDomainId,
  );
  const domain = prototypeDomain ?? liveResearch.data?.catalog.domain ?? null;
  const [verifyOpen, setVerifyOpen] = useState(false);

  if (!prototypeDomain && liveResearch.isPending) {
    return (
      <WorkspacePageShell>
        <TypographyP size="small" tone="subtle">
          <FormattedMessage {...messages.loading} />
        </TypographyP>
      </WorkspacePageShell>
    );
  }

  if (!prototypeDomain && liveResearch.isError) {
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
        <DomainResearchMissingDomain organizationSlug={organizationSlug} />
      </WorkspacePageShell>
    );
  }

  function handleSurfaceChange(next: string) {
    const nextSurface: DomainResearchSurface | undefined = isDomainResearchSurface(next)
      ? next
      : undefined;
    router.push(buildDomainPath(organizationSlug, linkedDomainId, nextSurface));
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
            market: domain.market.label,
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
      ) : (
        children
      )}

      <DomainVerifyDialog
        open={verifyOpen}
        domainKey={domain.domainKey}
        onOpenChange={setVerifyOpen}
      />
    </WorkspacePageShell>
  );
}
