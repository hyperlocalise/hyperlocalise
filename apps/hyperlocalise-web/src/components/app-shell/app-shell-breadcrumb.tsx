"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

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

type AppShellBreadcrumbProps = {
  organizationSlug: string;
};

export function AppShellBreadcrumb({ organizationSlug }: AppShellBreadcrumbProps) {
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

  const breadcrumbs = getAppShellBreadcrumbs(pathname, {
    projectName: projectQuery.data?.name,
  });

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

          return (
            <Fragment key={`${crumb.href ?? crumb.label}-${index}`}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem className="min-w-0">
                {isLast || !crumb.href ? (
                  <BreadcrumbPage
                    className={cn(
                      "truncate font-semibold text-foreground",
                      isLast ? "text-base" : "text-sm",
                    )}
                  >
                    {crumb.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    render={<Link href={crumb.href} />}
                    className="truncate font-medium text-muted-foreground hover:text-foreground"
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
}
