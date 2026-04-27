"use client";

import {
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  LinkSquare02Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const overviewMetrics = [
  {
    label: "Jobs",
    value: "128",
    delta: "+24%",
    detail: "vs previous week",
    accent: "text-bud-500",
    bars: [24, 28, 27, 35, 44, 42, 58, 51, 47, 54, 52, 62],
  },
  {
    label: "Words localized",
    value: "1.2M",
    delta: "+18%",
    detail: "vs previous week",
    accent: "text-spruce-500",
    bars: [18, 31, 34, 46, 39, 35, 44, 56, 54, 42, 46, 61],
  },
  {
    label: "Critical errors",
    value: "7",
    delta: "-3",
    detail: "open release blockers",
    accent: "text-flame-100",
    bars: [58, 54, 49, 46, 42, 40, 36, 34, 29, 26, 24, 18],
  },
  {
    label: "Reviews",
    value: "42",
    delta: "14 due",
    detail: "awaiting human approval",
    accent: "text-dew-500",
    bars: [22, 24, 32, 30, 36, 42, 39, 48, 44, 51, 49, 57],
  },
] as const;

const localeReadiness = [
  {
    locale: "fr-FR",
    market: "France",
    status: "Ready",
    reviews: "0 pending",
    lastSync: "2m ago",
    next: "Ship",
    tone: "safe",
  },
  {
    locale: "de-DE",
    market: "Germany",
    status: "Needs review",
    reviews: "3 pending",
    lastSync: "18m ago",
    next: "Review disclaimer",
    tone: "watch",
  },
  {
    locale: "es-ES",
    market: "Spain",
    status: "Needs review",
    reviews: "5 pending",
    lastSync: "31m ago",
    next: "Approve launch copy",
    tone: "watch",
  },
  {
    locale: "ja-JP",
    market: "Japan",
    status: "Needs fix",
    reviews: "2 pending",
    lastSync: "44m ago",
    next: "Resolve product term",
    tone: "watch",
  },
  {
    locale: "pt-BR",
    market: "Brazil",
    status: "Blocked",
    reviews: "4 pending",
    lastSync: "1h ago",
    next: "Fix placeholders",
    tone: "risk",
  },
] as const;

const qualityTrendData = [
  { run: "R-18", score: 89 },
  { run: "R-12", score: 91 },
  { run: "R-9", score: 86 },
  { run: "R-6", score: 84 },
  { run: "R-3", score: 90 },
  { run: "Now", score: 92 },
] as const;

const reviewCoverageData = [
  { locale: "fr", drafted: 18, reviewed: 72, blocked: 10 },
  { locale: "de", drafted: 16, reviewed: 70, blocked: 14 },
  { locale: "es", drafted: 22, reviewed: 58, blocked: 20 },
  { locale: "ja", drafted: 20, reviewed: 56, blocked: 24 },
  { locale: "pt", drafted: 24, reviewed: 46, blocked: 30 },
] as const;

const issueBreakdownData = [
  { issue: "Terminology", count: 18 },
  { issue: "ICU", count: 11 },
  { issue: "Brand voice", count: 9 },
  { issue: "Length", count: 7 },
  { issue: "Context", count: 5 },
] as const;

const activeWorkflows = [
  {
    job: "Website launch",
    source: "GitHub PR #482",
    step: "Agent review",
    locales: "12",
    review: "3 pending",
    eval: "1 blocker",
    sync: "Phrase",
    next: "Review ja-JP glossary",
    status: "Running",
  },
  {
    job: "Marketing campaign",
    source: "Claude brief",
    step: "AI draft",
    locales: "8",
    review: "Queued",
    eval: "Not run",
    sync: "Lokalise",
    next: "Attach campaign context",
    status: "Queued",
  },
  {
    job: "Product update 2.3",
    source: "GitHub PR #477",
    step: "TMS sync",
    locales: "6",
    review: "Approved",
    eval: "Passed",
    sync: "Crowdin",
    next: "Merge release PR",
    status: "Succeeded",
  },
  {
    job: "Help center",
    source: "Docs import",
    step: "Regression check",
    locales: "4",
    review: "Blocked",
    eval: "2 critical",
    sync: "GitHub",
    next: "Fix ICU placeholders",
    status: "Failed",
  },
] as const;

const reviewQueue = [
  {
    locale: "pt-BR",
    title: "Pricing page blocked",
    detail: "2 ICU errors and 4 unapproved terms",
    owner: "Mariana",
    due: "32m",
    tone: "risk",
  },
  {
    locale: "ja-JP",
    title: "Glossary conflict",
    detail: "Product naming differs from approved TMS term",
    owner: "Yuki",
    due: "1h",
    tone: "watch",
  },
  {
    locale: "es-ES",
    title: "Campaign review",
    detail: "Human approval needed before sync",
    owner: "Lucia",
    due: "3h",
    tone: "watch",
  },
] as const;

const activityFeed = [
  {
    icon: SparklesIcon,
    title: "Agent drafted 8 campaign locales",
    detail: "Context included source brief, tone notes, and max length rules",
    time: "2m ago",
    tone: "bg-bud-500/20 text-bud-300",
  },
  {
    icon: CheckmarkCircle02Icon,
    title: "Eval gate passed for Product update 2.3",
    detail: "de-DE and fr-FR cleared regression checks",
    time: "1h ago",
    tone: "bg-grove-300/15 text-grove-300",
  },
  {
    icon: InformationCircleIcon,
    title: "Glossary review needed for Website launch",
    detail: "ja-JP terminology needs attention before TMS sync",
    time: "3h ago",
    tone: "bg-spruce-500/15 text-spruce-300",
  },
  {
    icon: LinkSquare02Icon,
    title: "GitHub content imported for Help center",
    detail: "Triggered by repository activity and scoped to changed strings",
    time: "5h ago",
    tone: "bg-dew-500/15 text-dew-500",
  },
] as const;

type Tone = "safe" | "watch" | "risk";

function statusClass(status: (typeof activeWorkflows)[number]["status"]) {
  switch (status) {
    case "Succeeded":
      return "border-grove-300/25 bg-grove-300/10 text-grove-300";
    case "Running":
      return "border-dew-500/25 bg-dew-500/10 text-dew-100";
    case "Queued":
      return "border-bud-500/25 bg-bud-500/10 text-bud-300";
    default:
      return "border-flame-700/25 bg-flame-700/10 text-flame-100";
  }
}

function toneClass(tone: Tone) {
  switch (tone) {
    case "safe":
      return "border-grove-300/25 bg-grove-300/10 text-grove-300";
    case "watch":
      return "border-bud-500/25 bg-bud-500/10 text-bud-300";
    default:
      return "border-flame-700/25 bg-flame-700/10 text-flame-100";
  }
}

export function DashboardPageContent() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <section className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div></div>
        <div className="flex flex-wrap gap-2">
          <Badge
            variant="outline"
            className="h-8 rounded-lg border-white/10 bg-white/4 text-white/64"
          >
            Last 7 days
          </Badge>
          <Badge
            variant="outline"
            className="h-8 rounded-lg border-white/10 bg-white/4 text-white/64"
          >
            Updated 2m ago
          </Badge>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" id="analytics">
        {overviewMetrics.map((metric) => (
          <Card
            key={metric.label}
            className="rounded-lg border border-white/8 bg-[#0b0b0b] py-0 text-white ring-0"
          >
            <CardContent className="px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-white/52">{metric.label}</p>
                  <p className="mt-2 font-heading text-3xl font-medium text-white">
                    {metric.value}
                  </p>
                  <p className="mt-2 text-xs text-white/44">
                    <span className={metric.accent}>{metric.delta}</span> {metric.detail}
                  </p>
                </div>
                <MiniTrend bars={metric.bars} className={metric.accent} />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)]">
        <Card className="rounded-lg border border-white/8 bg-[#0b0b0b] py-0 text-white ring-0">
          <CardHeader className="px-5 pt-5">
            <CardTitle className="text-xl text-white">Locales at a glance</CardTitle>
            <CardDescription className="text-white/48">
              Plain-language release status by market, with blockers and next actions visible.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-3">
            <div className="overflow-x-auto">
              <div className="min-w-2xl">
                <div className="grid grid-cols-[minmax(10rem,1fr)_7rem_minmax(8rem,1fr)_6rem_6rem_minmax(10rem,1fr)] gap-3 px-5 py-2 text-xs font-medium tracking-[0.08em] text-white/38 uppercase">
                  <p>Locale</p>
                  <p>Status</p>
                  <p>Reviews</p>
                  <p>Last sync</p>
                  <p>Next action</p>
                </div>
                <Separator className="bg-white/8" />
                {localeReadiness.map((row, index) => (
                  <div key={row.locale}>
                    <div className="grid grid-cols-[minmax(10rem,1fr)_7rem_minmax(8rem,1fr)_6rem_6rem_minmax(10rem,1fr)] items-center gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">{row.locale}</p>
                        <p className="mt-0.5 text-xs text-white/42">{row.market}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "w-fit rounded-full px-2.5 py-0 text-[0.7rem]",
                          toneClass(row.tone),
                        )}
                      >
                        {row.status}
                      </Badge>
                      <p className="text-sm text-white/58">{row.reviews}</p>
                      <p className="text-sm text-white/48">{row.lastSync}</p>
                      <p className="truncate text-sm text-white/72">{row.next}</p>
                    </div>
                    {index < localeReadiness.length - 1 ? (
                      <Separator className="bg-white/8" />
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border border-white/8 bg-[#0b0b0b] py-0 text-white ring-0">
          <CardHeader className="px-5 pt-5">
            <CardTitle className="text-xl text-white">Review queue</CardTitle>
            <CardDescription className="text-white/48">
              Human approvals and blocked locales that need attention before release.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-3">
            {reviewQueue.map((item, index) => (
              <div key={`${item.locale}-${item.title}`}>
                <div className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-full px-2 py-0 text-[0.7rem]",
                            toneClass(item.tone),
                          )}
                        >
                          {item.locale}
                        </Badge>
                        <p className="truncate text-sm font-medium text-white">{item.title}</p>
                      </div>
                      <p className="mt-2 text-xs text-white/42">{item.detail}</p>
                    </div>
                    <p className="shrink-0 text-xs text-white/38">Due {item.due}</p>
                  </div>
                  <p className="mt-3 text-xs text-white/48">Owner: {item.owner}</p>
                </div>
                {index < reviewQueue.length - 1 ? <Separator className="bg-white/8" /> : null}
              </div>
            ))}
            <div className="px-5">
              <InlineLink label="Open review workspace" />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Quality trend" description="Eval score over recent agent runs.">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={qualityTrendData} margin={{ top: 8, right: 12, left: -24, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
              <XAxis
                dataKey="run"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "rgba(255,255,255,0.42)", fontSize: 12 }}
              />
              <YAxis
                domain={[80, 96]}
                tickCount={5}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "rgba(255,255,255,0.42)", fontSize: 12 }}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="var(--color-bud-500)"
                strokeWidth={3}
                dot={{ r: 4, strokeWidth: 0, fill: "var(--color-bud-500)" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Review coverage"
          description="Drafted, reviewed, and blocked work by locale."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={reviewCoverageData}
              margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
              barCategoryGap={18}
            >
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
              <XAxis
                dataKey="locale"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "rgba(255,255,255,0.42)", fontSize: 12 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: "rgba(255,255,255,0.42)", fontSize: 12 }}
              />
              <Bar dataKey="drafted" stackId="coverage" fill="var(--color-dew-500)" />
              <Bar dataKey="reviewed" stackId="coverage" fill="var(--color-grove-300)" />
              <Bar dataKey="blocked" stackId="coverage" fill="var(--color-flame-700)" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Issue breakdown" description="Current blockers ranked by release impact.">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={issueBreakdownData}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 18, bottom: 0 }}
            >
              <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.08)" />
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "rgba(255,255,255,0.42)", fontSize: 12 }}
              />
              <YAxis
                type="category"
                dataKey="issue"
                tickLine={false}
                axisLine={false}
                width={72}
                tick={{ fill: "rgba(255,255,255,0.48)", fontSize: 12 }}
              />
              <Bar dataKey="count" fill="var(--color-spruce-500)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
        <Card
          id="projects"
          className="rounded-lg border border-white/8 bg-[#0b0b0b] py-0 text-white ring-0"
        >
          <CardHeader className="px-5 pt-5">
            <CardTitle className="text-xl text-white">Active localization workflows</CardTitle>
            <CardDescription className="text-white/48">
              Agent runs, review gates, eval status, and sync targets for current release work.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-3">
            <div className="overflow-x-auto">
              <div className="min-w-232">
                <div className="grid grid-cols-[minmax(11rem,1.1fr)_8rem_8rem_5rem_7rem_7rem_7rem_minmax(11rem,1fr)_7rem] gap-3 px-5 py-2 text-xs font-medium tracking-[0.08em] text-white/38 uppercase">
                  <p>Job</p>
                  <p>Source</p>
                  <p>Step</p>
                  <p>Locales</p>
                  <p>Review</p>
                  <p>Eval</p>
                  <p>Sync</p>
                  <p>Next action</p>
                  <p>Status</p>
                </div>
                <Separator className="bg-white/8" />
                {activeWorkflows.map((workflow, index) => (
                  <div key={workflow.job}>
                    <div className="grid grid-cols-[minmax(11rem,1.1fr)_8rem_8rem_5rem_7rem_7rem_7rem_minmax(11rem,1fr)_7rem] items-center gap-3 px-5 py-3">
                      <p className="truncate text-sm text-white">{workflow.job}</p>
                      <p className="truncate text-sm text-white/48">{workflow.source}</p>
                      <p className="text-sm text-white/58">{workflow.step}</p>
                      <p className="text-sm text-white/58">{workflow.locales}</p>
                      <p className="text-sm text-white/58">{workflow.review}</p>
                      <p className="text-sm text-white/58">{workflow.eval}</p>
                      <p className="text-sm text-white/48">{workflow.sync}</p>
                      <p className="truncate text-sm text-white/72">{workflow.next}</p>
                      <Badge className={cn("rounded-full border", statusClass(workflow.status))}>
                        {workflow.status}
                      </Badge>
                    </div>
                    {index < activeWorkflows.length - 1 ? (
                      <Separator className="bg-white/8" />
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5">
              <InlineLink label="View all workflows" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border border-white/8 bg-[#0b0b0b] py-0 text-white ring-0">
          <CardHeader className="px-5 pt-5">
            <CardTitle className="text-xl text-white">Agent activity</CardTitle>
            <CardDescription className="text-white/48">
              Recent automation events with context, evals, and sync outcomes attached.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-3">
            {activityFeed.map((item, index) => (
              <div key={item.title}>
                <div className="flex gap-3 px-5 py-4">
                  <div
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full",
                      item.tone,
                    )}
                  >
                    <HugeiconsIcon icon={item.icon} strokeWidth={1.7} className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-white">{item.title}</p>
                      <p className="shrink-0 text-xs text-white/38">{item.time}</p>
                    </div>
                    <p className="mt-1 text-xs text-white/42">{item.detail}</p>
                  </div>
                </div>
                {index < activityFeed.length - 1 ? <Separator className="bg-white/8" /> : null}
              </div>
            ))}
            <div className="px-5">
              <InlineLink label="View all activity" />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-lg border border-white/8 bg-[#0b0b0b] py-0 text-white ring-0">
      <CardHeader className="px-5 pt-5">
        <CardTitle className="text-xl text-white">{title}</CardTitle>
        <CardDescription className="text-white/48">{description}</CardDescription>
      </CardHeader>
      <CardContent className="h-56 px-3 pb-5">{children}</CardContent>
    </Card>
  );
}

function MiniTrend({ bars, className }: { bars: readonly number[]; className: string }) {
  return (
    <div className="flex h-14 w-28 items-end gap-1" aria-hidden="true">
      {bars.map((height, index) => (
        <div
          key={`${height}-${index}`}
          className={cn("w-1 rounded-full bg-current opacity-80", className)}
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
}

function InlineLink({ label }: { label: string }) {
  return (
    <button type="button" className="mt-5 flex items-center gap-2 text-sm text-white/54">
      <span>{label}</span>
      <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.7} className="size-4" />
    </button>
  );
}
