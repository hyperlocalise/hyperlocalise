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
import { useQuery } from "@tanstack/react-query";
import { useIntl } from "react-intl";

import type { LinkedDomainPublic } from "@/lib/linked-domains/types";
import { useOrgRouter } from "@/lib/navigation/use-org-router";

import { BreadcrumbCrumbSelector } from "./breadcrumb-crumb-selector";
import { breadcrumbCrumbSelectorMessages as messages } from "./breadcrumb-crumb-selector.messages";
import { buildDomainPath } from "./navigation-config";

const organizationDomainsQueryKey = (organizationSlug: string) =>
  ["linked-domains", organizationSlug, "breadcrumb"] as const;

type DomainBreadcrumbSelectorProps = {
  organizationSlug: string;
  linkedDomainId: string;
  domainName: string;
  isLast?: boolean;
};

export function DomainBreadcrumbSelector({
  organizationSlug,
  linkedDomainId,
  domainName,
  isLast = false,
}: DomainBreadcrumbSelectorProps) {
  const intl = useIntl();
  const router = useOrgRouter();
  const domainsQuery = useQuery({
    queryKey: organizationDomainsQueryKey(organizationSlug),
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
        throw new Error(
          body.message || body.error || intl.formatMessage(messages.domainsLoadError),
        );
      }

      return (body.linkedDomains ?? []).map((domain) => ({
        value: domain.id,
        label: domain.domainKey,
      }));
    },
  });

  function handleSelect(nextLinkedDomainId: string) {
    if (nextLinkedDomainId === linkedDomainId) {
      return;
    }

    router.push(buildDomainPath(organizationSlug, nextLinkedDomainId));
  }

  return (
    <BreadcrumbCrumbSelector
      value={linkedDomainId}
      label={domainName}
      options={domainsQuery.data ?? []}
      onSelect={handleSelect}
      isLoading={domainsQuery.isPending}
      isError={domainsQuery.isError}
      menuLabel={intl.formatMessage(messages.switchDomain)}
      isLast={isLast}
    />
  );
}
