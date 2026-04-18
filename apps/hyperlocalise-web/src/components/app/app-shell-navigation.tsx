"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";

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

type AppShellNavigationProps = {
  items: readonly NavigationItem[];
};

export function AppShellNavigation({ items }: AppShellNavigationProps) {
  const pathname = usePathname();

  return (
    <SidebarGroup className="p-0">
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {items.map((item) => {
            const itemPathname = item.href.split("#", 1)[0];
            const isActive =
              pathname === itemPathname ||
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
  );
}
