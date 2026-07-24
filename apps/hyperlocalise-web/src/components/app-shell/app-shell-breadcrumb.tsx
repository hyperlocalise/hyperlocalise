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
import { apiClient } from "@/lib/api-client-instance";
import { cn } from "@/lib/primitives/cn";

import { getAppShellBreadcrumbs } from "./app-shell-title";
import { parseProjectRoute } from "./navigation-config";
import { useAppShellStore } from "./store/app-shell-store-context";

type AppShellBreadcrumbProps = {
  organizationSlug: string;
};

export const AppShellBreadcrumb = observer(function AppShellBreadcrumb({
  organizationSlug,
}: AppShellBreadcrumbProps) {
  const intl = useIntl();
  const store = useAppShellStore();
  const pathname = usePathname();
  const projectRoute = parseProjectRoute(pathname);
  const resolvedOrganizationSlug = projectRoute?.organizationSlug ?? organizationSlug;

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

  const breadcrumbs = store.breadcrumb.applyOverrides(
    getAppShellBreadcrumbs(pathname, intl, {
      projectName: projectQuery.data?.name,
    }),
  );

  if (breadcrumbs.length === 1) {
    return (
      <BreadcrumbPage className="truncate text-base font-semibold text-foreground">
        {breadcrumbs[0]!.label}
      </BreadcrumbPage>
    );
  }

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap gap-1.5 text-sm sm:gap-2">
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          const tooltip = crumb.title ?? (isLast ? crumb.label : undefined);

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
                {isLast || !crumb.href ? (
                  <BreadcrumbPage
                    className={cn(
                      "block truncate font-semibold text-foreground",
                      isLast ? "text-base" : "text-sm",
                    )}
                    title={tooltip}
                  >
                    {crumb.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    render={<Link href={crumb.href} />}
                    className="block truncate font-medium text-muted-foreground hover:text-foreground"
                    title={crumb.label}
                  >
                    {crumb.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
});
