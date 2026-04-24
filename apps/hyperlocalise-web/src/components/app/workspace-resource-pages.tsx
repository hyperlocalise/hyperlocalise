"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  BookOpenTextIcon,
  CheckmarkCircle02Icon,
  FileSyncIcon,
  FolderKanbanIcon,
  InformationCircleIcon,
  SparklesIcon,
  Task01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type Icon = ComponentProps<typeof HugeiconsIcon>["icon"];
type Tone = "safe" | "watch" | "risk" | "info";

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

const jobs = [
  {
    id: "JOB-1842",
    name: "Pricing page copy",
    project: "Website launch",
    status: "Needs review",
    step: "Human approval",
    locales: "pt-BR, ja-JP",
    words: "8,420",
    quality: "88%",
    due: "Today",
    source: "GitHub PR #482",
    tone: "watch",
  },
  {
    id: "JOB-1839",
    name: "Release notes 2.3",
    project: "Product update 2.3",
    status: "Passed",
    step: "TMS sync",
    locales: "fr-FR, de-DE, es-ES",
    words: "12,180",
    quality: "96%",
    due: "Tomorrow",
    source: "GitHub PR #477",
    tone: "safe",
  },
  {
    id: "JOB-1836",
    name: "Help center onboarding",
    project: "Help center refresh",
    status: "Blocked",
    step: "Eval gate",
    locales: "de-DE, pt-BR",
    words: "21,900",
    quality: "71%",
    due: "Overdue",
    source: "Docs import",
    tone: "risk",
  },
  {
    id: "JOB-1831",
    name: "Spring campaign hero",
    project: "Spring campaign",
    status: "Drafting",
    step: "AI draft",
    locales: "8 locales",
    words: "4,760",
    quality: "Pending",
    due: "Friday",
    source: "Campaign brief",
    tone: "info",
  },
] as const;

const glossaries = [
  {
    name: "Product names",
    terms: "284",
    locales: "12",
    coverage: 91,
    owner: "Yuki Tanaka",
    updated: "12m ago",
    status: "Reviewing",
    tone: "watch",
  },
  {
    name: "Legal disclaimers",
    terms: "143",
    locales: "8",
    coverage: 98,
    owner: "Amelia Stone",
    updated: "37m ago",
    status: "Approved",
    tone: "safe",
  },
  {
    name: "Payments vocabulary",
    terms: "96",
    locales: "10",
    coverage: 84,
    owner: "Jon Bell",
    updated: "2h ago",
    status: "Needs work",
    tone: "risk",
  },
] as const;

const glossaryTerms = [
  {
    source: "checkout session",
    approved: "session de paiement",
    locale: "fr-FR",
    usage: "Payments flow",
    status: "Approved",
    tone: "safe",
  },
  {
    source: "workspace",
    approved: "espacio de trabajo",
    locale: "es-ES",
    usage: "Navigation",
    status: "Approved",
    tone: "safe",
  },
  {
    source: "usage cap",
    approved: "Nutzungslimit",
    locale: "de-DE",
    usage: "Billing",
    status: "Review",
    tone: "watch",
  },
  {
    source: "smart routing",
    approved: "smart routing",
    locale: "ja-JP",
    usage: "Feature copy",
    status: "Conflict",
    tone: "risk",
  },
] as const;

const projectMetrics = [
  { label: "Active projects", value: "14", detail: "4 need attention", tone: "info" },
  { label: "Locale coverage", value: "92%", detail: "across priority markets", tone: "safe" },
  { label: "Blocked work", value: "3", detail: "release blockers open", tone: "risk" },
] as const;

const jobMetrics = [
  { label: "Running jobs", value: "21", detail: "9 in review", tone: "info" },
  { label: "Words this week", value: "1.2M", detail: "+18% vs last week", tone: "safe" },
  { label: "Failed evals", value: "5", detail: "2 critical", tone: "risk" },
] as const;

const glossaryMetrics = [
  { label: "Glossaries", value: "9", detail: "3 connected to TMS", tone: "info" },
  { label: "Approved terms", value: "4,820", detail: "92% coverage", tone: "safe" },
  { label: "Conflicts", value: "11", detail: "need reviewer input", tone: "watch" },
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

const jobPipeline = [
  { step: "Queued", count: "5", detail: "waiting for provider capacity" },
  { step: "Drafting", count: "7", detail: "agent generating locale variants" },
  { step: "Review", count: "9", detail: "human approval required" },
  { step: "Sync", count: "4", detail: "ready for TMS handoff" },
] as const;

function toneClass(tone: Tone) {
  switch (tone) {
    case "safe":
      return "border-grove-300/25 bg-grove-300/10 text-grove-300";
    case "watch":
      return "border-bud-500/25 bg-bud-500/10 text-bud-300";
    case "risk":
      return "border-flame-700/25 bg-flame-700/10 text-flame-100";
    default:
      return "border-dew-500/25 bg-dew-500/10 text-dew-100";
  }
}

function PageHeader({
  icon,
  label,
  title,
  description,
  statusLabel,
}: {
  icon: Icon;
  label: string;
  title: string;
  description: string;
  statusLabel: string;
}) {
  return (
    <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <div className="flex items-center gap-2 text-sm text-white/48">
          <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-4" />
          <span>{label}</span>
        </div>
        <h1 className="mt-2 font-heading text-2xl font-medium text-white">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-white/52">{description}</p>
      </div>
      <Badge
        variant="outline"
        className="h-8 w-fit rounded-lg border-white/10 bg-white/4 text-white/64"
      >
        {statusLabel}
      </Badge>
    </section>
  );
}

function MetricsGrid({
  metrics,
}: {
  metrics: readonly { label: string; value: string; detail: string; tone: Tone }[];
}) {
  return (
    <section className="grid gap-3 md:grid-cols-3">
      {metrics.map((metric) => (
        <Card
          key={metric.label}
          className="rounded-lg border border-white/8 bg-[#0b0b0b] py-0 text-white ring-0"
        >
          <CardContent className="px-4 py-4">
            <p className="text-sm text-white/52">{metric.label}</p>
            <div className="mt-3 flex items-end justify-between gap-4">
              <p className="font-heading text-3xl font-medium text-white">{metric.value}</p>
              <Badge variant="outline" className={cn("rounded-full", toneClass(metric.tone))}>
                {metric.detail}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function ProgressBar({ value, tone }: { value: number; tone: Tone }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-white/8" aria-label={`${value}% complete`}>
      <div
        className={cn(
          "h-full rounded-full",
          tone === "safe" && "bg-grove-300",
          tone === "watch" && "bg-bud-500",
          tone === "risk" && "bg-flame-700",
          tone === "info" && "bg-dew-500",
        )}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

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

function ResourceCard({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: Icon;
  children: ReactNode;
}) {
  return (
    <Card className="rounded-lg border border-white/8 bg-[#0b0b0b] py-0 text-white ring-0">
      <CardHeader className="px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl text-white">{title}</CardTitle>
            <CardDescription className="mt-1 text-white/48">{description}</CardDescription>
          </div>
          <HugeiconsIcon icon={icon} strokeWidth={1.8} className="mt-1 size-5 text-white/42" />
        </div>
      </CardHeader>
      <Separator className="bg-white/8" />
      <CardContent className="px-0 pb-3">{children}</CardContent>
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
            <div className="min-w-[60rem]">
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

export function JobsPageContent() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <PageHeader
        icon={Task01Icon}
        label="Translation queue"
        title="Jobs"
        description="Follow translation work from source import through AI drafting, eval gates, human review, and TMS sync."
        statusLabel="21 running"
      />
      <MetricsGrid metrics={jobMetrics} />
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
        <ResourceCard
          title="Translation jobs"
          description="Mock job queue with status, locale scope, source, and release pressure."
          icon={Task01Icon}
        >
          <div className="overflow-x-auto">
            <div className="min-w-[64rem]">
              <div className="grid grid-cols-[7rem_minmax(12rem,1.2fr)_minmax(10rem,1fr)_8rem_8rem_8rem_7rem_7rem_9rem] gap-3 px-5 py-2 text-xs font-medium tracking-[0.08em] text-white/38 uppercase">
                <p>ID</p>
                <p>Job</p>
                <p>Project</p>
                <p>Status</p>
                <p>Step</p>
                <p>Locales</p>
                <p>Words</p>
                <p>Quality</p>
                <p>Due</p>
              </div>
              <Separator className="bg-white/8" />
              {jobs.map((job, index) => (
                <div key={job.id}>
                  <div className="grid grid-cols-[7rem_minmax(12rem,1.2fr)_minmax(10rem,1fr)_8rem_8rem_8rem_7rem_7rem_9rem] items-center gap-3 px-5 py-4">
                    <p className="text-sm text-white/48">{job.id}</p>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{job.name}</p>
                      <p className="mt-0.5 truncate text-xs text-white/42">{job.source}</p>
                    </div>
                    <p className="truncate text-sm text-white/58">{job.project}</p>
                    <Badge variant="outline" className={cn("rounded-full", toneClass(job.tone))}>
                      {job.status}
                    </Badge>
                    <p className="text-sm text-white/58">{job.step}</p>
                    <p className="truncate text-sm text-white/58">{job.locales}</p>
                    <p className="text-sm text-white/48">{job.words}</p>
                    <p className="text-sm text-white/72">{job.quality}</p>
                    <p className="text-sm text-white/58">{job.due}</p>
                  </div>
                  {index < jobs.length - 1 ? <Separator className="bg-white/8" /> : null}
                </div>
              ))}
            </div>
          </div>
        </ResourceCard>
        <ResourceCard
          title="Pipeline"
          description="Current mocked distribution by job stage."
          icon={FileSyncIcon}
        >
          <div className="px-5 pb-2">
            {jobPipeline.map((stage, index) => (
              <div key={stage.step}>
                <div className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <p className="text-sm font-medium text-white">{stage.step}</p>
                    <p className="mt-1 text-xs text-white/42">{stage.detail}</p>
                  </div>
                  <p className="font-heading text-2xl font-medium text-white">{stage.count}</p>
                </div>
                {index < jobPipeline.length - 1 ? <Separator className="bg-white/8" /> : null}
              </div>
            ))}
          </div>
        </ResourceCard>
      </section>
    </div>
  );
}

export function GlossariesPageContent() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <PageHeader
        icon={BookOpenTextIcon}
        label="Term library"
        title="Glossaries"
        description="Manage approved product terms, legal wording, and locale-specific vocabulary that guides every translation run."
        statusLabel="9 mocked"
      />
      <MetricsGrid metrics={glossaryMetrics} />
      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <ResourceCard
          title="Glossary sets"
          description="Mock glossary coverage by domain, locale count, and reviewer state."
          icon={BookOpenTextIcon}
        >
          <div className="px-5 pb-2">
            {glossaries.map((glossary, index) => (
              <div key={glossary.name}>
                <div className="grid gap-4 py-4 md:grid-cols-[minmax(0,1fr)_7rem_8rem_8rem] md:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-white">{glossary.name}</p>
                      <Badge
                        variant="outline"
                        className={cn("rounded-full", toneClass(glossary.tone))}
                      >
                        {glossary.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-white/42">
                      Owner: {glossary.owner} · Updated {glossary.updated}
                    </p>
                  </div>
                  <p className="text-sm text-white/58">{glossary.terms} terms</p>
                  <p className="text-sm text-white/58">{glossary.locales} locales</p>
                  <div className="flex flex-col gap-2">
                    <ProgressBar value={glossary.coverage} tone={glossary.tone} />
                    <p className="text-xs text-white/42">{glossary.coverage}% coverage</p>
                  </div>
                </div>
                {index < glossaries.length - 1 ? <Separator className="bg-white/8" /> : null}
              </div>
            ))}
          </div>
        </ResourceCard>
        <ResourceCard
          title="Term review"
          description="Representative terms that localization jobs can enforce during drafting and evals."
          icon={BookOpenTextIcon}
        >
          <div className="overflow-x-auto">
            <div className="min-w-[44rem]">
              <div className="grid grid-cols-[minmax(10rem,1fr)_minmax(10rem,1fr)_6rem_minmax(8rem,1fr)_7rem] gap-3 px-5 py-2 text-xs font-medium tracking-[0.08em] text-white/38 uppercase">
                <p>Source</p>
                <p>Approved term</p>
                <p>Locale</p>
                <p>Usage</p>
                <p>Status</p>
              </div>
              <Separator className="bg-white/8" />
              {glossaryTerms.map((term, index) => (
                <div key={`${term.locale}-${term.source}`}>
                  <div className="grid grid-cols-[minmax(10rem,1fr)_minmax(10rem,1fr)_6rem_minmax(8rem,1fr)_7rem] items-center gap-3 px-5 py-4">
                    <p className="truncate text-sm text-white">{term.source}</p>
                    <p className="truncate text-sm text-white/72">{term.approved}</p>
                    <p className="text-sm text-white/48">{term.locale}</p>
                    <p className="truncate text-sm text-white/58">{term.usage}</p>
                    <Badge variant="outline" className={cn("rounded-full", toneClass(term.tone))}>
                      {term.status}
                    </Badge>
                  </div>
                  {index < glossaryTerms.length - 1 ? <Separator className="bg-white/8" /> : null}
                </div>
              ))}
            </div>
          </div>
        </ResourceCard>
      </section>
    </div>
  );
}
