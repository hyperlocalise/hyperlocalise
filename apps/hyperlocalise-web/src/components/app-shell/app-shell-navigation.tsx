"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowDown01Icon, ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { observer } from "mobx-react-lite";
import { FormattedMessage, useIntl } from "react-intl";

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
import { cn } from "@/lib/primitives/cn";

import { appShellNavigationMessages } from "./app-shell-navigation.messages";
import {
  buildOrganizationPath,
  buildProjectNavigationItems,
  isNavigationItemActive,
  parseProjectRoute,
  type NavigationGroup,
  type NavigationItem,
} from "./navigation-config";
import { useAppShellStore } from "./store/app-shell-store-context";

type AppShellNavigationProps = {
  organizationSlug: string;
};

export const AppShellNavigation = observer(function AppShellNavigation({
  organizationSlug,
}: AppShellNavigationProps) {
  const store = useAppShellStore();
  const pathname = usePathname();
  const projectRoute = parseProjectRoute(pathname);

  if (store.navigation.mode === "custom" && store.navigation.customState) {
    const customState = store.navigation.customState;

    if (customState.projectContext) {
      return (
        <ProjectNavigation
          organizationSlug={customState.projectContext.organizationSlug}
          projectId={customState.projectContext.projectId}
          pathname={pathname}
          projectName={customState.projectContext.projectName}
          items={customState.groups.flatMap((group) => group.items)}
        />
      );
    }

    return (
      <GlobalNavigation
        organizationSlug={organizationSlug}
        groups={customState.groups}
        pathname={pathname}
      />
    );
  }

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
    <GlobalNavigation
      organizationSlug={organizationSlug}
      groups={store.navigation.defaultNavigationGroups}
      pathname={pathname}
    />
  );
});

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
          <Collapsible key={group.label} defaultOpen className={cn(groupIndex > 0 && "mt-2")}>
            <SidebarGroup className="p-0">
              <CollapsibleTrigger className="group/collapsible-trigger flex h-7 w-full items-center gap-2 rounded-md px-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase outline-hidden transition-[margin,opacity,color] duration-200 hover:text-sidebar-foreground focus-visible:text-sidebar-foreground group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0">
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
  projectName,
  items,
}: {
  organizationSlug: string;
  projectId: string;
  pathname: string;
  projectName?: string;
  items?: readonly NavigationItem[];
}) {
  const intl = useIntl();
  const projectQuery = useQuery({
    queryKey: ["translation-project", organizationSlug, projectId],
    enabled: !projectName && !items,
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

  const resolvedItems = items ?? buildProjectNavigationItems(organizationSlug, projectId, intl);
  const resolvedProjectName =
    projectName ??
    projectQuery.data?.name ??
    intl.formatMessage(appShellNavigationMessages.projectFallbackName);
  const projectsHref = buildOrganizationPath(organizationSlug, "projects");
  const allProjectsLabel = intl.formatMessage(appShellNavigationMessages.allProjects);

  return (
    <div className="flex flex-col gap-3">
      <SidebarGroup className="p-0">
        <SidebarGroupContent>
          <SidebarMenu className="gap-1">
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link href={projectsHref} />}
                tooltip={allProjectsLabel}
                className="h-8 rounded-md px-2.5 text-sm font-medium text-muted-foreground hover:text-sidebar-foreground group-data-[collapsible=icon]:size-8!"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-4" />
                <span>
                  <FormattedMessage {...appShellNavigationMessages.allProjects} />
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup className="gap-1 p-0">
        <SidebarGroupLabel className="h-auto px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase group-data-[collapsible=icon]:hidden">
          <FormattedMessage {...appShellNavigationMessages.projectSection} />
        </SidebarGroupLabel>
        <div className="px-3 pb-1 group-data-[collapsible=icon]:hidden">
          {!projectName && projectQuery.isLoading ? (
            <Skeleton className="h-5 w-4/5" />
          ) : (
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              {resolvedProjectName}
            </p>
          )}
        </div>
        <NavigationGroupItems
          group={{ items: resolvedItems }}
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
  const intl = useIntl();

  return (
    <SidebarGroupContent>
      <SidebarMenu className="gap-1">
        {group.items.map((item) => {
          const isActive = isNavigationItemActive(pathname, item.href, {
            projectId,
            organizationSlug,
          });
          const tooltip = item.badge
            ? intl.formatMessage(appShellNavigationMessages.badgeSeparator, {
                label: item.label,
                badge: item.badge,
              })
            : item.label;

          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                render={<Link href={item.href} />}
                isActive={isActive}
                tooltip={tooltip}
                className={navigationButtonClass(isActive)}
              >
                <HugeiconsIcon icon={item.icon} strokeWidth={2} className="size-4" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.badge ? (
                  <span className="ms-auto inline-flex shrink-0 items-center rounded-full border border-sidebar-border bg-sidebar px-1.5 py-0.5 text-[0.625rem] leading-none font-medium tracking-normal text-muted-foreground group-data-[collapsible=icon]:hidden">
                    {item.badge}
                  </span>
                ) : null}
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
    "h-8 rounded-md px-2.5 text-sm font-medium text-muted-foreground hover:text-sidebar-foreground group-data-[collapsible=icon]:size-8!",
    isActive && "bg-sidebar-accent font-semibold text-sidebar-accent-foreground",
  );
}
