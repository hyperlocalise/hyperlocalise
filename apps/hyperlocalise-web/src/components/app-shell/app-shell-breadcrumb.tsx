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
import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { observer } from "mobx-react-lite";
import { useIntl } from "react-intl";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client-instance";
import type { LinkedDomainPublic } from "@/lib/linked-domains/types";
import { cn } from "@/lib/primitives/cn";

import {
  getAppShellBreadcrumbs,
  type AppShellBreadcrumb as AppShellBreadcrumbItem,
} from "./app-shell-title";
import { DomainBreadcrumbSelector } from "./domain-breadcrumb-selector";
import {
  buildOrganizationPath,
  buildProjectPath,
  parseDomainRoute,
  parseProjectRoute,
  parseTeamRoute,
} from "./navigation-config";
import { ProjectBreadcrumbSelector } from "./project-breadcrumb-selector";
import { useAppShellStore } from "./store/app-shell-store-context";
import { TeamBreadcrumbSelector } from "./team-breadcrumb-selector";

type AppShellBreadcrumbProps = {
  organizationSlug: string;
};

type SelectorCrumbKind = "project" | "team" | "domain";

function isProjectBreadcrumbCrumb(
  crumb: AppShellBreadcrumbItem,
  index: number,
  breadcrumbs: readonly AppShellBreadcrumbItem[],
  organizationSlug: string,
  projectId: string,
) {
  if (index !== 1 || breadcrumbs.length < 2) {
    return false;
  }

  const projectHref = buildProjectPath(organizationSlug, projectId);
  return crumb.href === projectHref || crumb.href === undefined;
}

function isTeamBreadcrumbCrumb(
  crumb: AppShellBreadcrumbItem,
  index: number,
  breadcrumbs: readonly AppShellBreadcrumbItem[],
  organizationSlug: string,
) {
  if (index !== 1 || breadcrumbs.length !== 2 || crumb.href) {
    return false;
  }

  return breadcrumbs[0]?.href === buildOrganizationPath(organizationSlug, "teams");
}

function isDomainBreadcrumbCrumb(
  crumb: AppShellBreadcrumbItem,
  index: number,
  breadcrumbs: readonly AppShellBreadcrumbItem[],
  organizationSlug: string,
) {
  if (index !== 1 || breadcrumbs.length !== 2 || crumb.href) {
    return false;
  }

  return breadcrumbs[0]?.href === buildOrganizationPath(organizationSlug, "domains");
}

function resolveSelectorCrumbKind(
  crumb: AppShellBreadcrumbItem,
  index: number,
  breadcrumbs: readonly AppShellBreadcrumbItem[],
  organizationSlug: string,
  projectRoute: ReturnType<typeof parseProjectRoute>,
  teamRoute: ReturnType<typeof parseTeamRoute>,
  domainRoute: ReturnType<typeof parseDomainRoute>,
): SelectorCrumbKind | null {
  if (
    projectRoute?.projectId &&
    isProjectBreadcrumbCrumb(crumb, index, breadcrumbs, organizationSlug, projectRoute.projectId)
  ) {
    return "project";
  }

  if (teamRoute?.teamId && isTeamBreadcrumbCrumb(crumb, index, breadcrumbs, organizationSlug)) {
    return "team";
  }

  if (
    domainRoute?.linkedDomainId &&
    isDomainBreadcrumbCrumb(crumb, index, breadcrumbs, organizationSlug)
  ) {
    return "domain";
  }

  return null;
}

function BreadcrumbCrumbContent({
  crumb,
  isLast,
}: {
  crumb: AppShellBreadcrumbItem;
  isLast: boolean;
}) {
  if (crumb.render) {
    return <>{crumb.render()}</>;
  }

  if (crumb.isLoading) {
    return <Skeleton aria-hidden className={cn("rounded-md", isLast ? "h-5 w-28" : "h-4 w-24")} />;
  }

  const tooltip = crumb.title ?? (isLast ? crumb.label : undefined);

  if (isLast || !crumb.href) {
    return (
      <BreadcrumbPage
        className={cn(
          "block truncate font-semibold text-foreground",
          isLast ? "text-base" : "text-sm",
        )}
        title={tooltip}
      >
        {crumb.label}
      </BreadcrumbPage>
    );
  }

  return (
    <BreadcrumbLink
      render={<Link href={crumb.href} />}
      className="block truncate font-medium text-muted-foreground hover:text-foreground"
      title={crumb.label}
    >
      {crumb.label}
    </BreadcrumbLink>
  );
}

function SelectorBreadcrumbCrumbContent({
  crumb,
  isLast,
  selectorKind,
  organizationSlug,
  projectRoute,
  teamRoute,
  domainRoute,
  projectName,
  teamName,
  domainName,
}: {
  crumb: AppShellBreadcrumbItem;
  isLast: boolean;
  selectorKind: SelectorCrumbKind;
  organizationSlug: string;
  projectRoute: ReturnType<typeof parseProjectRoute>;
  teamRoute: ReturnType<typeof parseTeamRoute>;
  domainRoute: ReturnType<typeof parseDomainRoute>;
  projectName?: string;
  teamName?: string;
  domainName?: string;
}) {
  if (crumb.render) {
    return <>{crumb.render()}</>;
  }

  if (crumb.isLoading) {
    return <Skeleton aria-hidden className={cn("rounded-md", isLast ? "h-5 w-28" : "h-4 w-24")} />;
  }

  if (selectorKind === "project" && projectRoute) {
    return (
      <ProjectBreadcrumbSelector
        organizationSlug={organizationSlug}
        projectId={projectRoute.projectId}
        projectName={projectName?.trim() || crumb.label || projectRoute.projectId}
        section={projectRoute.section}
        isLast={isLast}
      />
    );
  }

  if (selectorKind === "team" && teamRoute) {
    return (
      <TeamBreadcrumbSelector
        organizationSlug={organizationSlug}
        teamId={teamRoute.teamId}
        teamName={teamName?.trim() || crumb.label || teamRoute.teamId}
        isLast={isLast}
      />
    );
  }

  if (selectorKind === "domain" && domainRoute) {
    return (
      <DomainBreadcrumbSelector
        organizationSlug={organizationSlug}
        linkedDomainId={domainRoute.linkedDomainId}
        domainName={domainName?.trim() || crumb.label || domainRoute.linkedDomainId}
        isLast={isLast}
      />
    );
  }

  return <BreadcrumbCrumbContent crumb={crumb} isLast={isLast} />;
}

export const AppShellBreadcrumb = observer(function AppShellBreadcrumb({
  organizationSlug,
}: AppShellBreadcrumbProps) {
  const intl = useIntl();
  const store = useAppShellStore();
  const pathname = usePathname();
  const projectRoute = parseProjectRoute(pathname);
  const teamRoute = parseTeamRoute(pathname);
  const domainRoute = parseDomainRoute(pathname);
  const resolvedOrganizationSlug =
    projectRoute?.organizationSlug ??
    teamRoute?.organizationSlug ??
    domainRoute?.organizationSlug ??
    organizationSlug;

  const projectQuery = useQuery({
    queryKey: ["translation-project", resolvedOrganizationSlug, projectRoute?.projectId],
    enabled: Boolean(projectRoute?.projectId),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].$get({
        param: {
          organizationSlug: resolvedOrganizationSlug,
          projectId: projectRoute!.projectId,
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to load project (${response.status})`);
      }
      const body = (await response.json()) as { project: { name: string } };
      return body.project;
    },
  });

  const teamQuery = useQuery({
    queryKey: ["workspace-team", resolvedOrganizationSlug, teamRoute?.teamId],
    enabled: Boolean(teamRoute?.teamId),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].teams[":teamId"].$get({
        param: {
          organizationSlug: resolvedOrganizationSlug,
          teamId: teamRoute!.teamId,
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to load team (${response.status})`);
      }
      const body = (await response.json()) as { team: { name: string } };
      return body.team;
    },
  });

  const domainQuery = useQuery({
    queryKey: ["linked-domain", resolvedOrganizationSlug, domainRoute?.linkedDomainId],
    enabled: Boolean(domainRoute?.linkedDomainId),
    queryFn: async () => {
      const response = await fetch(
        `/api/orgs/${encodeURIComponent(resolvedOrganizationSlug)}/linked-domains/${encodeURIComponent(domainRoute!.linkedDomainId)}`,
      );
      const body = (await response.json().catch(() => ({}))) as {
        linkedDomain?: LinkedDomainPublic;
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.message || body.error || "Failed to load domain");
      }
      if (!body.linkedDomain) {
        throw new Error("Failed to load domain");
      }
      return body.linkedDomain;
    },
  });

  const breadcrumbs = store.breadcrumb.applyOverrides(
    getAppShellBreadcrumbs(pathname, intl, {
      projectName: projectQuery.data?.name,
      projectNameLoading: projectQuery.isPending,
      teamName: teamQuery.data?.name,
      teamNameLoading: teamQuery.isPending,
      domainName: domainQuery.data?.domainKey,
      domainNameLoading: domainQuery.isPending,
    }),
  );

  if (breadcrumbs.length === 1) {
    const crumb = breadcrumbs[0]!;

    if (crumb.render) {
      return <>{crumb.render()}</>;
    }

    if (crumb.isLoading) {
      return <Skeleton aria-hidden className="h-5 w-28 rounded-md" />;
    }

    return (
      <BreadcrumbPage className="truncate text-base font-semibold text-foreground">
        {crumb.label}
      </BreadcrumbPage>
    );
  }

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap gap-1.5 text-sm sm:gap-2">
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          const selectorKind = resolveSelectorCrumbKind(
            crumb,
            index,
            breadcrumbs,
            resolvedOrganizationSlug,
            projectRoute,
            teamRoute,
            domainRoute,
          );

          return (
            <Fragment key={`${crumb.href ?? crumb.label}-${index}`}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem
                className={cn(
                  "min-w-0",
                  isLast
                    ? "max-w-[min(100%,14rem)] sm:max-w-xs md:max-w-sm"
                    : "max-w-[7rem] shrink-0 sm:max-w-[9rem]",
                )}
              >
                {selectorKind ? (
                  <SelectorBreadcrumbCrumbContent
                    crumb={crumb}
                    isLast={isLast}
                    selectorKind={selectorKind}
                    organizationSlug={resolvedOrganizationSlug}
                    projectRoute={projectRoute}
                    teamRoute={teamRoute}
                    domainRoute={domainRoute}
                    projectName={projectQuery.data?.name}
                    teamName={teamQuery.data?.name}
                    domainName={domainQuery.data?.domainKey}
                  />
                ) : (
                  <BreadcrumbCrumbContent crumb={crumb} isLast={isLast} />
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
});
