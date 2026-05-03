"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type NavigationItem = {
  label: string;
  href: string;
  icon: ComponentProps<typeof HugeiconsIcon>["icon"];
};

type NavigationGroup = {
  label?: string;
  items: readonly NavigationItem[];
};

type AppShellNavigationProps = {
  groups: readonly NavigationGroup[];
};

export function AppShellNavigation({ groups }: AppShellNavigationProps) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group, groupIndex) => {
        const content = <NavigationGroupItems group={group} pathname={pathname} />;

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
              <CollapsibleTrigger className="group/collapsible-trigger flex h-7 w-full items-center gap-2 rounded-md px-3 text-left text-[0.68rem] tracking-[0.08em] text-app-shell-foreground/34 uppercase outline-hidden transition-[margin,opacity] duration-200 hover:text-app-shell-foreground/54 focus-visible:text-app-shell-foreground/64 group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0">
                <span className="min-w-0 flex-1 truncate">{group.label}</span>
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  strokeWidth={1.8}
                  className="size-3.5 shrink-0 transition-transform group-data-[panel-open]/collapsible-trigger:rotate-180"
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

function NavigationGroupItems({ group, pathname }: { group: NavigationGroup; pathname: string }) {
  return (
    <SidebarGroupContent>
      <SidebarMenu className="gap-1">
        {group.items.map((item) => {
          const itemPathname = item.href.split("#", 1)[0];
          const isActive =
            pathname === itemPathname ||
            pathname.startsWith(`${itemPathname}/`) ||
            (itemPathname.endsWith("/dashboard") && pathname.startsWith(itemPathname));

          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                render={<Link href={item.href} />}
                isActive={isActive}
                tooltip={item.label}
                className={cn(
                  "h-10 rounded-lg px-3 text-sm font-normal text-app-shell-foreground/68 hover:text-app-shell-foreground group-data-[collapsible=icon]:size-9!",
                  isActive && "bg-app-shell-foreground/10 text-app-shell-foreground",
                )}
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
