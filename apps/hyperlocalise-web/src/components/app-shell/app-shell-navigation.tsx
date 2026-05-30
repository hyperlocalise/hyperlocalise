"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowDown01Icon, ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client-instance";
import { cn } from "@/lib/utils";

import {
  buildOrganizationPath,
  buildProjectNavigationItems,
  parseProjectRoute,
  type NavigationGroup,
  type NavigationItem,
} from "./navigation-config";

type AppShellNavigationProps = {
  organizationSlug: string;
  groups: readonly NavigationGroup[];
};

export function AppShellNavigation({ organizationSlug, groups }: AppShellNavigationProps) {
  const pathname = usePathname();
  const projectRoute = parseProjectRoute(pathname);

  if (projectRoute?.organizationSlug === organizationSlug) {
    return (
      <ProjectNavigation
        organizationSlug={organizationSlug}
        projectId={projectRoute.projectId}
        pathname={pathname}
      />
    );
  }

  return (
    <GlobalNavigation organizationSlug={organizationSlug} groups={groups} pathname={pathname} />
  );
}

function GlobalNavigation({
  organizationSlug,
  groups,
  pathname,
}: {
  organizationSlug: string;
  groups: readonly NavigationGroup[];
  pathname: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group, groupIndex) => {
        const content = (
          <NavigationGroupItems
            group={group}
            pathname={pathname}
            organizationSlug={organizationSlug}
          />
        );

        if (!group.label) {
          return (
            <SidebarGroup key={`promoted-${groupIndex}`} className="p-0">
              {content}
            </SidebarGroup>
          );
        }

        return (
          <Collapsible key={group.label} defaultOpen>
            <SidebarGroup className="p-0">
              <CollapsibleTrigger className="group/collapsible-trigger flex h-7 w-full items-center gap-2 rounded-md px-3 text-left text-[0.68rem] tracking-[0.08em] text-sidebar-foreground/34 uppercase outline-hidden transition-[margin,opacity] duration-200 hover:text-sidebar-foreground/54 focus-visible:text-sidebar-foreground/64 group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0">
                <span className="min-w-0 flex-1 truncate">{group.label}</span>
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  strokeWidth={1.8}
                  className="size-3.5 shrink-0 transition-transform group-data-panel-open/collapsible-trigger:rotate-180"
                />
              </CollapsibleTrigger>
              <CollapsibleContent hiddenUntilFound>{content}</CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        );
      })}
    </div>
  );
}

function ProjectNavigation({
  organizationSlug,
  projectId,
  pathname,
}: {
  organizationSlug: string;
  projectId: string;
  pathname: string;
}) {
  const projectQuery = useQuery({
    queryKey: ["translation-project", organizationSlug, projectId],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].$get({
        param: { organizationSlug, projectId },
      });
      if (!response.ok) {
        throw new Error(`Failed to load project (${response.status})`);
      }
      const body = (await response.json()) as { project: { id: string; name: string } };
      return body.project;
    },
  });

  const items = buildProjectNavigationItems(organizationSlug, projectId);
  const projectsHref = buildOrganizationPath(organizationSlug, "projects");

  return (
    <div className="flex flex-col gap-3">
      <SidebarGroup className="p-0">
        <SidebarGroupContent>
          <SidebarMenu className="gap-1">
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link href={projectsHref} />}
                tooltip="All projects"
                className="h-9 rounded-lg px-3 text-sm font-normal text-sidebar-foreground/54 hover:text-sidebar-foreground group-data-[collapsible=icon]:size-9!"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-4" />
                <span>All projects</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup className="gap-1 p-0">
        <SidebarGroupLabel className="h-auto px-3 py-1 text-[0.68rem] tracking-[0.08em] text-sidebar-foreground/34 uppercase group-data-[collapsible=icon]:hidden">
          Project
        </SidebarGroupLabel>
        <div className="px-3 pb-1 group-data-[collapsible=icon]:hidden">
          {projectQuery.isLoading ? (
            <Skeleton className="h-5 w-4/5" />
          ) : (
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              {projectQuery.data?.name ?? "Project"}
            </p>
          )}
        </div>
        <NavigationGroupItems
          group={{ items }}
          pathname={pathname}
          organizationSlug={organizationSlug}
          projectId={projectId}
        />
      </SidebarGroup>
    </div>
  );
}

function NavigationGroupItems({
  group,
  pathname,
  organizationSlug,
  projectId,
}: {
  group: { items: readonly NavigationItem[] };
  pathname: string;
  organizationSlug: string;
  projectId?: string;
}) {
  return (
    <SidebarGroupContent>
      <SidebarMenu className="gap-1">
        {group.items.map((item) => {
          const isActive = isNavigationItemActive(pathname, item.href, {
            projectId,
            organizationSlug,
          });

          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                render={<Link href={item.href} />}
                isActive={isActive}
                tooltip={item.label}
                className={navigationButtonClass(isActive)}
              >
                <HugeiconsIcon icon={item.icon} strokeWidth={2} className="size-5" />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroupContent>
  );
}

function navigationButtonClass(isActive: boolean) {
  return cn(
    "h-10 rounded-lg px-3 text-sm font-normal text-sidebar-foreground/68 hover:text-sidebar-foreground group-data-[collapsible=icon]:size-9!",
    isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
  );
}

function isNavigationItemActive(
  pathname: string,
  href: string,
  options?: {
    exact?: boolean;
    projectId?: string;
    organizationSlug?: string;
  },
) {
  const itemPathname = href.split("#", 1)[0];

  if (options?.exact) {
    return pathname === itemPathname;
  }

  if (options?.projectId && options.organizationSlug) {
    const overviewHref = `/org/${options.organizationSlug}/projects/${options.projectId}`;
    if (itemPathname === overviewHref) {
      return pathname === overviewHref;
    }
  }

  if (pathname === itemPathname) {
    return true;
  }

  if (pathname.startsWith(`${itemPathname}/`)) {
    return true;
  }

  if (
    itemPathname.endsWith("/command-center") &&
    pathname.startsWith(itemPathname.replace("command-center", "dashboard"))
  ) {
    return true;
  }

  if (
    itemPathname.endsWith("/my-work") &&
    pathname.startsWith(itemPathname.replace("my-work", "my-jobs"))
  ) {
    return true;
  }

  if (
    itemPathname.endsWith("/new-request") &&
    pathname.startsWith(itemPathname.replace("new-request", "chat"))
  ) {
    return true;
  }

  if (itemPathname.endsWith("/projects") && pathname.includes("/projects/")) {
    return false;
  }

  if (
    itemPathname.endsWith("/projects") &&
    (pathname === itemPathname || pathname.startsWith(`${itemPathname}/`))
  ) {
    return true;
  }

  return false;
}
