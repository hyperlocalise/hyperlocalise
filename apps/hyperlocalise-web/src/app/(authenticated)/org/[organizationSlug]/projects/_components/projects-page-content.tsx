"use client";

import {
  CheckmarkCircle02Icon,
  FolderKanbanIcon,
  InformationCircleIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import {
  MetricsGrid,
  PageHeader,
  ProgressBar,
  ResourceCard,
  toneClass,
  type Icon,
} from "../../_components/workspace-resource-shared";

const projects = [
  {
    name: "Website launch",
    key: "WEB",
    owner: "Maya Chen",
    status: "Running",
    locales: "12",
    jobs: "8 active",
    progress: 76,
    source: "GitHub PR #482",
    next: "Review ja-JP glossary conflict",
    updated: "2m ago",
    tone: "info",
  },
  {
    name: "Product update 2.3",
    key: "APP",
    owner: "Noah Kim",
    status: "Ready",
    locales: "6",
    jobs: "2 active",
    progress: 94,
    source: "GitHub PR #477",
    next: "Merge release PR",
    updated: "41m ago",
    tone: "safe",
  },
  {
    name: "Help center refresh",
    key: "DOCS",
    owner: "Priya Rao",
    status: "Blocked",
    locales: "4",
    jobs: "3 active",
    progress: 48,
    source: "Docs import",
    next: "Fix ICU placeholder regression",
    updated: "1h ago",
    tone: "risk",
  },
  {
    name: "Spring campaign",
    key: "MKT",
    owner: "Elena Torres",
    status: "Queued",
    locales: "8",
    jobs: "5 queued",
    progress: 32,
    source: "Campaign brief",
    next: "Attach regional tone notes",
    updated: "3h ago",
    tone: "watch",
  },
] as const;

const projectMetrics = [
  { label: "Active projects", value: "14", detail: "4 need attention", tone: "info" },
  { label: "Locale coverage", value: "92%", detail: "across priority markets", tone: "safe" },
  { label: "Blocked work", value: "3", detail: "release blockers open", tone: "risk" },
] as const;

const projectActivity = [
  {
    icon: SparklesIcon,
    title: "Website launch drafted 6 locales",
    detail: "Agent used glossary constraints, page context, and max-length rules.",
    time: "2m ago",
    tone: "bg-bud-500/20 text-bud-300",
  },
  {
    icon: CheckmarkCircle02Icon,
    title: "Product update passed quality gate",
    detail: "French, German, and Spanish release notes cleared automated evals.",
    time: "41m ago",
    tone: "bg-grove-300/15 text-grove-300",
  },
  {
    icon: InformationCircleIcon,
    title: "Help center blocked on ICU placeholders",
    detail: "Two strings need source fixes before translations can sync.",
    time: "1h ago",
    tone: "bg-flame-700/15 text-flame-100",
  },
] as const;

function IconPill({ icon, tone }: { icon: Icon; tone: string }) {
  return (
    <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", tone)}>
      <HugeiconsIcon icon={icon} strokeWidth={1.7} className="size-4" />
    </div>
  );
}

function ActivityCard() {
  return (
    <Card className="rounded-lg border border-white/8 bg-[#0b0b0b] py-0 text-white ring-0">
      <CardHeader className="px-5 py-5">
        <CardTitle className="text-xl text-white">Recent workspace activity</CardTitle>
        <CardDescription className="text-white/48">
          Mocked operational events across projects, jobs, and glossary checks.
        </CardDescription>
      </CardHeader>
      <Separator className="bg-white/8" />
      <CardContent className="px-0 pb-3">
        {projectActivity.map((item, index) => (
          <div key={item.title}>
            <div className="flex gap-3 px-5 py-4">
              <IconPill icon={item.icon} tone={item.tone} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-white">{item.title}</p>
                  <p className="shrink-0 text-xs text-white/38">{item.time}</p>
                </div>
                <p className="mt-1 text-xs leading-5 text-white/42">{item.detail}</p>
              </div>
            </div>
            {index < projectActivity.length - 1 ? <Separator className="bg-white/8" /> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ProjectsPageContent() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <PageHeader
        icon={FolderKanbanIcon}
        label="Workspace projects"
        title="Projects"
        description="Track localization programs by release, source, owner, and market readiness before they move into translation jobs."
        statusLabel="4 mocked"
      />
      <MetricsGrid metrics={projectMetrics} />
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
        <ResourceCard
          title="Project portfolio"
          description="Mock project health with source links, active job counts, and next actions."
          icon={FolderKanbanIcon}
        >
          <div className="overflow-x-auto">
            <div className="min-w-240">
              <div className="grid grid-cols-[minmax(12rem,1.2fr)_5rem_8rem_7rem_7rem_minmax(10rem,1fr)_minmax(12rem,1fr)_7rem] gap-3 px-5 py-2 text-xs font-medium tracking-[0.08em] text-white/38 uppercase">
                <p>Project</p>
                <p>Key</p>
                <p>Status</p>
                <p>Locales</p>
                <p>Jobs</p>
                <p>Progress</p>
                <p>Next action</p>
                <p>Updated</p>
              </div>
              <Separator className="bg-white/8" />
              {projects.map((project, index) => (
                <div key={project.key}>
                  <div className="grid grid-cols-[minmax(12rem,1.2fr)_5rem_8rem_7rem_7rem_minmax(10rem,1fr)_minmax(12rem,1fr)_7rem] items-center gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{project.name}</p>
                      <p className="mt-0.5 truncate text-xs text-white/42">{project.source}</p>
                    </div>
                    <p className="text-sm text-white/48">{project.key}</p>
                    <Badge
                      variant="outline"
                      className={cn("rounded-full", toneClass(project.tone))}
                    >
                      {project.status}
                    </Badge>
                    <p className="text-sm text-white/58">{project.locales}</p>
                    <p className="text-sm text-white/58">{project.jobs}</p>
                    <div className="flex flex-col gap-2">
                      <ProgressBar value={project.progress} tone={project.tone} />
                      <p className="text-xs text-white/42">{project.progress}% complete</p>
                    </div>
                    <p className="truncate text-sm text-white/72">{project.next}</p>
                    <p className="text-sm text-white/42">{project.updated}</p>
                  </div>
                  {index < projects.length - 1 ? <Separator className="bg-white/8" /> : null}
                </div>
              ))}
            </div>
          </div>
        </ResourceCard>
        <ActivityCard />
      </section>
    </div>
  );
}
