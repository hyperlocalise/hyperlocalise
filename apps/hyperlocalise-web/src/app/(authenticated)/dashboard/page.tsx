import type { ComponentProps } from "react";
import {
  Alert02Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  DollarCircleIcon,
  InformationCircleIcon,
  LinkSquare02Icon,
  Shield01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const weeklyKpis = [
  {
    label: "Words processed",
    value: "1.84M",
    delta: "+14% vs last week",
    note: "Throughput is ahead of plan across 47 runs.",
  },
  {
    label: "QA error rate",
    value: "1.9%",
    delta: "-0.4 pts vs last week",
    note: "Quality has tightened after glossary enforcement.",
  },
  {
    label: "Average turnaround time",
    value: "6.8h",
    delta: "-42 min vs last week",
    note: "Most runs are clearing review inside the same day.",
  },
  {
    label: "Blocked locales",
    value: "3",
    delta: "+1 vs last week",
    note: "Japanese checkout and two German legal strings need attention.",
  },
] as const;

const weeklyFlow = [
  { day: "Mon", runs: 6, words: "214k", height: "42%", quality: "2.4%" },
  { day: "Tue", runs: 7, words: "263k", height: "54%", quality: "2.2%" },
  { day: "Wed", runs: 8, words: "318k", height: "68%", quality: "1.8%" },
  { day: "Thu", runs: 11, words: "401k", height: "84%", quality: "1.6%" },
  { day: "Fri", runs: 9, words: "356k", height: "74%", quality: "1.7%" },
  { day: "Sat", runs: 4, words: "152k", height: "31%", quality: "2.1%" },
  { day: "Sun", runs: 2, words: "138k", height: "27%", quality: "1.9%" },
] as const;

const operationsNotes = [
  {
    title: "Throughput is up",
    body: "Words processed are ahead of last week, mostly from help center and storefront refreshes.",
    icon: ArrowRight01Icon,
  },
  {
    title: "Quality is stable",
    body: "QA error rate dropped after moving high-risk strings back to the primary model path.",
    icon: Shield01Icon,
  },
  {
    title: "Blockers are narrow",
    body: "Only three locales are blocked, but one of them touches checkout and affects release timing.",
    icon: Alert02Icon,
  },
] as const;

const summaryRows = [
  {
    icon: SparklesIcon,
    label: "Runs completed",
    value: "47",
    note: "11 more than last week",
  },
  {
    icon: DollarCircleIcon,
    label: "Token cost",
    value: "$538",
    note: "Primary model spend remains inside budget",
  },
  {
    icon: Clock01Icon,
    label: "Review backlog",
    value: "41 pending",
    note: "Mostly de-DE and ja-JP reviewer confirmations",
  },
  {
    icon: InformationCircleIcon,
    label: "Human escalation rate",
    value: "8.5%",
    note: "Down after glossary enforcement on checkout strings",
  },
] as const;

const inFlightRuns = [
  {
    run: "Storefront release 24.4",
    locale: "ja-JP",
    words: "48k words",
    model: "GPT-5.4",
    status: "Blocked",
    next: "Fix glossary mismatch in checkout flow",
  },
  {
    run: "Growth campaign Q2",
    locale: "de-DE",
    words: "32k words",
    model: "GPT-5.4",
    status: "Needs review",
    next: "Resolve tone comments before sync window",
  },
  {
    run: "Help center refresh",
    locale: "fr-FR",
    words: "76k words",
    model: "GPT-4.1 mini",
    status: "Syncing",
    next: "Waiting for TMS confirmations",
  },
  {
    run: "Mobile onboarding",
    locale: "es-419",
    words: "19k words",
    model: "GPT-5.4",
    status: "Ready",
    next: "Release after final pullback",
  },
] as const;

const modelEconomics = [
  {
    name: "GPT-5.4",
    runs: "29 runs",
    words: "1.12M words",
    tokens: "26.4M tokens",
    cost: "$412",
    note: "Primary for product UI and higher-risk branded copy.",
  },
  {
    name: "GPT-4.1 mini",
    runs: "14 runs",
    words: "540k words",
    tokens: "11.8M tokens",
    cost: "$126",
    note: "Used for docs and low-risk bulk refreshes.",
  },
  {
    name: "Human review",
    runs: "4 escalations",
    words: "182k words",
    tokens: "n/a",
    cost: "$0 API",
    note: "Reserved for tone drift, legal content, and glossary breaks.",
  },
] as const;

const syncHealth = [
  { label: "Average sync lag", value: "6 min", note: "Inside target" },
  { label: "Failed pushes", value: "2", note: "Both retried successfully" },
  { label: "Pending reviewer confirmations", value: "41", note: "Mostly de-DE and ja-JP" },
  { label: "Last webhook incident", value: "10:12 UTC", note: "Resolved in 8 minutes" },
] as const;

const blockedLocales = [
  {
    locale: "ja-JP",
    issue: "Checkout glossary mismatch",
    owner: "Aya",
    age: "9h",
  },
  {
    locale: "de-DE",
    issue: "Legal disclaimer needs reviewer sign-off",
    owner: "Marta",
    age: "6h",
  },
  {
    locale: "de-AT",
    issue: "Pending sync retry after imported comments",
    owner: "System",
    age: "2h",
  },
] as const;

function runStatusClass(status: (typeof inFlightRuns)[number]["status"]) {
  switch (status) {
    case "Ready":
      return "border-white/10 bg-white/6 text-white/84";
    case "Needs review":
      return "border-white/10 bg-white/5 text-white/74";
    case "Syncing":
      return "border-white/10 bg-white/4 text-white/64";
    default:
      return "border-white/14 bg-white/10 text-white";
  }
}

export default function DashboardPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <section className="rounded-2xl border border-white/8 bg-[#080808]" id="analytics">
        <div className="grid gap-8 px-5 py-5 lg:grid-cols-[minmax(0,1.35fr)_24rem] lg:px-6">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge className="bg-white text-black">Week 16</Badge>
              <Badge variant="outline" className="border-white/10 bg-transparent text-white/52">
                Weekly operations
              </Badge>
            </div>
            <h1 className="mt-4 max-w-3xl font-heading text-3xl leading-tight font-medium tracking-[-0.03em] text-white sm:text-4xl">
              Are we on track this week?
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/58 sm:text-base">
              Weekly operations start with throughput, quality, turnaround, and blocked locales.
              Everything below explains why the week is healthy or where it is slipping.
            </p>
          </div>

          <div className="grid gap-0 rounded-2xl border border-white/8 bg-[#050505]">
            {operationsNotes.map((signal, index) => (
              <div key={signal.title}>
                <div className="flex gap-3 px-4 py-4">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/70">
                    <HugeiconsIcon icon={signal.icon} strokeWidth={1.7} className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{signal.title}</p>
                    <p className="mt-1 text-sm leading-6 text-white/54">{signal.body}</p>
                  </div>
                </div>
                {index < operationsNotes.length - 1 ? <Separator className="bg-white/8" /> : null}
              </div>
            ))}
          </div>
        </div>

        <Separator className="bg-white/8" />

        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          {weeklyKpis.map((metric, index) => (
            <div
              key={metric.label}
              className={cn(
                "px-5 py-4 lg:px-6",
                index > 0 && "border-t border-white/8 sm:border-t-0 sm:border-l",
              )}
            >
              <p className="text-[0.68rem] font-medium tracking-[0.18em] text-white/40 uppercase">
                {metric.label}
              </p>
              <div className="mt-2 font-heading text-3xl font-medium text-white">{metric.value}</div>
              <p className="mt-2 text-sm text-white/56">{metric.delta}</p>
              <p className="mt-1 max-w-[24ch] text-sm leading-6 text-white/42">{metric.note}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
        <Card className="rounded-2xl border border-white/8 bg-[#080808] py-0 text-white ring-0">
          <CardHeader className="gap-2 px-5 py-5 lg:px-6">
            <Badge
              variant="outline"
              className="w-fit rounded-full border-white/10 bg-transparent text-white/48"
            >
              Weekly flow
            </Badge>
            <CardTitle className="text-xl font-medium text-white">Runs and volume over the week</CardTitle>
            <CardDescription className="text-white/52">
              The week ramps through Thursday, with quality staying below the 2% error threshold.
            </CardDescription>
          </CardHeader>
          <Separator className="bg-white/8" />
          <CardContent className="px-5 py-5 lg:px-6">
            <div className="grid grid-cols-7 gap-3">
              {weeklyFlow.map((day) => (
                <div key={day.day} className="rounded-xl border border-white/8 bg-[#050505] px-3 py-3">
                  <p className="text-xs font-medium tracking-[0.18em] text-white/40 uppercase">
                    {day.day}
                  </p>
                  <div className="mt-4 flex h-28 items-end">
                    <div
                      className="w-full rounded-md bg-white/78"
                      style={{ height: day.height }}
                    />
                  </div>
                  <p className="mt-3 text-sm text-white">{day.words}</p>
                  <p className="mt-1 text-sm text-white/46">{day.runs} runs</p>
                  <p className="mt-1 text-sm text-white/46">QA {day.quality}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-white/8 bg-[#080808] py-0 text-white ring-0">
          <CardHeader className="gap-2 px-5 py-5">
            <Badge
              variant="outline"
              className="w-fit rounded-full border-white/10 bg-transparent text-white/48"
            >
              Weekly summary
            </Badge>
            <CardTitle className="text-xl font-medium text-white">What changed this week</CardTitle>
            <CardDescription className="text-white/52">
              Fast context before you drill into queue, model cost, or sync health.
            </CardDescription>
          </CardHeader>
          <Separator className="bg-white/8" />
          <CardContent className="grid gap-0 px-0 py-0">
            {summaryRows.map((item, index) => (
              <div key={item.label}>
                <SignalRow
                  icon={item.icon}
                  label={item.label}
                  value={item.value}
                  note={item.note}
                />
                {index < summaryRows.length - 1 ? <Separator className="bg-white/8" /> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
        <Card
          id="run"
          className="rounded-2xl border border-white/8 bg-[#080808] py-0 text-white ring-0"
        >
          <CardHeader className="gap-2 px-5 py-5 lg:px-6">
            <Badge
              variant="outline"
              className="w-fit rounded-full border-white/10 bg-transparent text-white/48"
            >
              Translation run
            </Badge>
            <CardTitle className="text-xl font-medium text-white">Runs needing attention now</CardTitle>
            <CardDescription className="text-white/52">
              In-flight queue with the next action visible on each row.
            </CardDescription>
          </CardHeader>
          <Separator className="bg-white/8" />
          <CardContent className="grid gap-0 px-0 py-0">
            {inFlightRuns.map((run, index) => (
              <div key={`${run.run}-${run.locale}`}>
                <div className="grid gap-3 px-5 py-4 lg:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <p className="font-heading text-lg font-medium text-white">{run.run}</p>
                      <Badge className={cn("rounded-full border", runStatusClass(run.status))}>
                        {run.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-white/54">{run.words}</p>
                  </div>
                  <div className="grid gap-1 text-sm text-white/50 sm:grid-cols-[7rem_7rem_1fr]">
                    <p>{run.locale}</p>
                    <p>{run.model}</p>
                    <p>{run.next}</p>
                  </div>
                </div>
                {index < inFlightRuns.length - 1 ? <Separator className="bg-white/8" /> : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card
          id="models"
          className="rounded-2xl border border-white/8 bg-[#080808] py-0 text-white ring-0"
        >
          <CardHeader className="gap-2 px-5 py-5">
            <Badge
              variant="outline"
              className="w-fit rounded-full border-white/10 bg-transparent text-white/48"
            >
              Model choice
            </Badge>
            <CardTitle className="text-xl font-medium text-white">Model volume and cost</CardTitle>
            <CardDescription className="text-white/52">
              Model usage should explain runs, words, token cost, and where escalation happened.
            </CardDescription>
          </CardHeader>
          <Separator className="bg-white/8" />
          <CardContent className="grid gap-0 px-0 py-0">
            {modelEconomics.map((model, index) => (
              <div key={model.name}>
                <div className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-heading text-lg font-medium text-white">{model.name}</p>
                      <p className="mt-1 text-sm text-white/44">{model.runs}</p>
                    </div>
                    <p className="font-heading text-lg font-medium text-white">{model.cost}</p>
                  </div>
                  <div className="mt-3 grid gap-1 text-sm text-white/54 sm:grid-cols-2">
                    <p>{model.words}</p>
                    <p>{model.tokens}</p>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/56">{model.note}</p>
                </div>
                {index < modelEconomics.length - 1 ? <Separator className="bg-white/8" /> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)]">
        <Card
          id="sync"
          className="rounded-2xl border border-white/8 bg-[#080808] py-0 text-white ring-0"
        >
          <CardHeader className="gap-2 px-5 py-5">
            <Badge
              variant="outline"
              className="w-fit rounded-full border-white/10 bg-transparent text-white/48"
            >
              TMS sync
            </Badge>
            <CardTitle className="text-xl font-medium text-white">Sync health this week</CardTitle>
            <CardDescription className="text-white/52">
              The operational view of lag, failures, pending confirmations, and incident recovery.
            </CardDescription>
          </CardHeader>
          <Separator className="bg-white/8" />
          <CardContent className="grid gap-0 px-0 py-0">
            {syncHealth.map((item, index) => (
              <div key={item.label}>
                <div className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_auto]">
                  <div>
                    <p className="text-sm font-medium text-white">{item.label}</p>
                    <p className="mt-1 text-sm leading-6 text-white/54">{item.note}</p>
                  </div>
                  <p className="font-heading text-lg font-medium text-white">{item.value}</p>
                </div>
                {index < syncHealth.length - 1 ? <Separator className="bg-white/8" /> : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-white/8 bg-[#080808] py-0 text-white ring-0">
          <CardHeader className="gap-2 px-5 py-5 lg:px-6">
            <Badge
              variant="outline"
              className="w-fit rounded-full border-white/10 bg-transparent text-white/48"
            >
              Blockers
            </Badge>
            <CardTitle className="text-xl font-medium text-white">Blocked locales this week</CardTitle>
            <CardDescription className="text-white/52">
              This is the short list keeping weekly operations from clearing cleanly.
            </CardDescription>
          </CardHeader>
          <Separator className="bg-white/8" />
          <CardContent className="grid gap-0 px-0 py-0">
            {blockedLocales.map((locale, index) => (
              <div key={locale.locale}>
                <div className="grid gap-3 px-5 py-4 lg:grid-cols-[5rem_minmax(0,1fr)_5rem_4rem] lg:px-6">
                  <p className="font-heading text-lg font-medium text-white">{locale.locale}</p>
                  <p className="text-sm text-white/56">{locale.issue}</p>
                  <p className="text-sm text-white/48">{locale.owner}</p>
                  <p className="text-sm text-white/48">{locale.age}</p>
                </div>
                {index < blockedLocales.length - 1 ? <Separator className="bg-white/8" /> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SignalRow({
  icon,
  label,
  value,
  note,
}: {
  icon: ComponentProps<typeof HugeiconsIcon>["icon"];
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="flex gap-3">
        <div className="mt-0.5 flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/68">
          <HugeiconsIcon icon={icon} strokeWidth={1.7} className="size-4" />
        </div>
        <div>
          <p className="text-sm text-white/62">{label}</p>
          <p className="mt-1 max-w-[20rem] text-sm leading-6 text-white/44">{note}</p>
        </div>
      </div>
      <p className="font-heading text-lg font-medium text-white">{value}</p>
    </div>
  );
}
