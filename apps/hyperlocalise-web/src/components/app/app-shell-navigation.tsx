"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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
  label: string;
  items: readonly NavigationItem[];
};

type AppShellNavigationProps = {
  groups: readonly NavigationGroup[];
};

export function AppShellNavigation({ groups }: AppShellNavigationProps) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <SidebarGroup key={group.label} className="p-0">
          <SidebarGroupLabel className="h-7 px-3 text-[0.68rem] tracking-[0.08em] text-white/34 uppercase">
            {group.label}
          </SidebarGroupLabel>
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
                        "h-10 rounded-lg px-3 text-sm font-normal text-white/68 hover:text-white",
                        isActive && "bg-white/10 text-white",
                      )}
                    >
                      <HugeiconsIcon icon={item.icon} strokeWidth={1.8} className="size-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </div>
  );
}
