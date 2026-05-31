"use client";

import Link from "next/link";
import { DashboardSquare01Icon } from "@hugeicons/core-free-icons";

import { buildProjectPath } from "@/components/app-shell/navigation-config";
import { cn } from "@/lib/primitives/cn";

import { ProjectPageShell, ProjectSectionHeader } from "./project-page-shell";

const executionLinks = [
  { label: "Files", section: "files", detail: "Source files and assets" },
  { label: "Locales", section: "locales", detail: "Language and market readiness" },
  { label: "Jobs", section: "jobs", detail: "Translation, review, QA, and sync" },
  { label: "Reviews", section: "reviews", detail: "Human decisions and approvals" },
  { label: "Context", section: "context", detail: "PRs, docs, tickets, and product notes" },
  { label: "QA", section: "qa", detail: "ICU, glossary, tone, and layout checks" },
  { label: "Agent Runs", section: "agent-runs", detail: "Automation history and confidence" },
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
        description="Execution hub for localization work. Agents prepare work, gather context, and route decisions; your team ships in the sections below."
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
