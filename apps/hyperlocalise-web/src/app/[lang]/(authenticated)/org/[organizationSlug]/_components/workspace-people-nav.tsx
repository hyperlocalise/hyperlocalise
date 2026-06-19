"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { stripAppLocalePrefix } from "@/components/app-shell/navigation-config";
import { cn } from "@/lib/primitives/cn";

type WorkspacePeopleSection = "teams" | "members";

const peopleSections: readonly {
  id: WorkspacePeopleSection;
  label: string;
  description: string;
}[] = [
  {
    id: "teams",
    label: "Teams",
    description: "Group workspace members into teams for project access.",
  },
  {
    id: "members",
    label: "Members",
    description: "Invite people and manage workspace roles.",
  },
] as const;

function resolveActiveSection(pathname: string, organizationSlug: string): WorkspacePeopleSection {
  const basePath = `/org/${organizationSlug}`;
  const normalizedPath = stripAppLocalePrefix(pathname);

  if (normalizedPath.startsWith(`${basePath}/members`)) {
    return "members";
  }

  return "teams";
}

export function WorkspacePeopleNav({ organizationSlug }: { organizationSlug: string }) {
  const pathname = usePathname();
  const activeSection = resolveActiveSection(pathname, organizationSlug);

  return (
    <nav aria-label="Workspace people" className="border-b border-foreground/8">
      <div className="flex flex-wrap gap-1">
        {peopleSections.map((section) => {
          const href = `/org/${organizationSlug}/${section.id}`;
          const isActive = activeSection === section.id;

          return (
            <Link
              key={section.id}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative inline-flex items-center px-3 py-2.5 text-sm font-medium transition-colors",
                "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:transition-opacity",
                isActive
                  ? "text-foreground after:bg-foreground after:opacity-100"
                  : "text-foreground/56 hover:text-foreground after:opacity-0",
              )}
            >
              {section.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
