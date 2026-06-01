"use client";

import Link from "next/link";
import { DashboardSquare01Icon } from "@hugeicons/core-free-icons";

import { buildProjectPath } from "@/components/app-shell/navigation-config";
import { cn } from "@/lib/primitives/cn";

import { ProjectPageShell, ProjectSectionHeader } from "./project-page-shell";

const executionLinks = [
  { label: "Files", section: "files", detail: "Upload source files for translation" },
  { label: "Jobs", section: "jobs", detail: "Translation and provider sync work" },
  { label: "Settings", section: "settings", detail: "Project metadata and translation guidance" },
] as const;

export function ProjectOverviewPageContent({
  organizationSlug,
  projectId,
}: {
  organizationSlug: string;
  projectId: string;
}) {
  return (
    <ProjectPageShell>
      <ProjectSectionHeader
        icon={DashboardSquare01Icon}
        section="Overview"
        description="Project hub for localization work. Upload source files, track jobs, and manage project settings from the sections below."
      />

      <section className="grid gap-3 sm:grid-cols-2">
        {executionLinks.map((link) => (
          <Link
            key={link.section}
            href={buildProjectPath(organizationSlug, projectId, link.section)}
            className={cn(
              "rounded-lg border border-border bg-card p-4 text-card-foreground transition-colors",
              "hover:bg-muted/20",
            )}
          >
            <p className="text-sm font-medium text-foreground">{link.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{link.detail}</p>
          </Link>
        ))}
      </section>
    </ProjectPageShell>
  );
}
