import {
  Alert02Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  GithubIcon,
  InformationCircleIcon,
  LinkSquare02Icon,
  Shield01Icon,
  SparklesIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldTitle } from "@/components/ui/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { env } from "@/lib/env";

const workflowSteps = [
  {
    label: "01",
    title: "Add content or connect your workflow",
    description:
      "Start from product copy, docs, JSON, or GitHub so translation work begins where your team already works.",
    meta: "Files, API, and GitHub",
  },
  {
    label: "02",
    title: "Translate with the model you choose",
    description:
      "Run AI translation at scale, compare models when needed, and keep prompts and glossary guidance consistent across every locale.",
    meta: "Model flexibility",
  },
  {
    label: "03",
    title: "Send work into human review",
    description:
      "Sync work into Crowdin or your TMS so reviewers have locale notes, glossary context, and a clear decision trail.",
    meta: "Review operations",
  },
  {
    label: "04",
    title: "Check quality before release",
    description:
      "Use quality checks, regressions, and release gates to see what changed, what passed, and what still needs attention.",
    meta: "Quality control",
  },
];

const valueCards = [
  {
    icon: SparklesIcon,
    title: "Move faster with AI-powered workflows",
    description:
      "Let AI handle the first translation pass, routing, and follow-up checks so localisation teams can move faster without managing every step by hand.",
    className: "",
  },
  {
    icon: LinkSquare02Icon,
    title: "TMS integration that keeps reviewers involved",
    description:
      "Sync into Crowdin or your TMS while keeping review decisions, context, and approvals attached to each run.",
    className: "",
  },
  {
    icon: Alert02Icon,
    title: "Quality checks before release",
    description:
      "Catch quality drops across locales and model changes before they ship, so faster output does not create more cleanup later.",
    className: "",
  },
  {
    icon: InformationCircleIcon,
    title: "Run history your team can trust",
    description:
      "See what changed, why it changed, who reviewed it, and what is still blocking release without chasing updates across tools.",
    className: "",
  },
];

const teamCards = [
  {
    icon: GithubIcon,
    title: "Built for localisation teams",
    description:
      "Run faster translation cycles, keep reviewers aligned, and track release readiness across locales from one shared view.",
  },
  {
    icon: CheckmarkCircle02Icon,
    title: "With the integrations engineering needs",
    description:
      "Connect through API and GitHub, keep source changes close to the workflow, and fit into the systems your product teams already use.",
  },
];

type DashboardRowTone = "ready" | "review" | "blocked";

type DashboardRow = {
  locale: string;
  status: string;
  progress: string;
  signal: string;
  tone: DashboardRowTone;
};

const dashboardRows: DashboardRow[] = [
  {
    locale: "fr-FR",
    status: "Ready to ship",
    progress: "12/12 reviewed",
    signal: "Eval pass",
    tone: "ready",
  },
  {
    locale: "de-DE",
    status: "Needs review",
    progress: "8/12 reviewed",
    signal: "Tone drift flagged",
    tone: "review",
  },
  {
    locale: "ja-JP",
    status: "Blocked",
    progress: "Regression open",
    signal: "Terminology mismatch",
    tone: "blocked",
  },
];

const githubRepoUrl = "https://github.com/hyperlocalise/hyperlocalise";
const footerLinks = [
  { label: "Open source", href: githubRepoUrl },
  { label: "Join waitlist", href: env.NEXT_PUBLIC_WAITLIST_URL },
] as const;

function getStatusToneClasses(tone: DashboardRowTone) {
  switch (tone) {
    case "ready":
      return "border-primary/20 bg-primary/10 text-primary";
    case "review":
      return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "blocked":
      return "border-destructive/20 bg-destructive/10 text-destructive dark:border-destructive/30";
  }
}

function getSignalToneClasses(tone: DashboardRowTone) {
  switch (tone) {
    case "ready":
      return "text-primary";
    case "review":
      return "text-amber-700 dark:text-amber-300";
    case "blocked":
      return "text-destructive";
  }
}

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="relative isolate">
        <div className="absolute inset-x-0 top-0 -z-10 h-152 bg-[radial-gradient(circle_at_top,rgba(79,180,141,0.16),transparent_58%)]" />
        <div className="absolute inset-x-0 top-40 -z-10 h-120 bg-[radial-gradient(circle_at_center,rgba(79,180,141,0.08),transparent_62%)]" />

        <section className="mx-auto flex w-full max-w-7xl flex-col px-6 pb-18 pt-8 sm:px-8 lg:px-12 lg:pt-12">
          <Hero />
        </section>

        <Separator className="bg-foreground/6" />

        <section className="mx-auto w-full max-w-7xl px-6 py-18 sm:px-8 lg:px-12">
          <WorkflowSection />
        </section>

        <Separator className="bg-foreground/6" />

        <section className="bg-muted/30">
          <div className="mx-auto w-full max-w-7xl px-6 py-18 sm:px-8 lg:px-12">
            <ValueSection />
          </div>
        </section>

        <Separator className="bg-foreground/6" />

        <section className="mx-auto w-full max-w-7xl px-6 py-18 sm:px-8 lg:px-12">
          <DashboardSection />
        </section>

        <Separator className="bg-foreground/6" />

        <section className="bg-muted/30">
          <div className="mx-auto w-full max-w-7xl px-6 py-18 sm:px-8 lg:px-12">
            <TeamSection />
          </div>
        </section>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <>
      <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
        <h1 className="max-w-5xl font-heading text-5xl leading-[0.94] font-semibold tracking-[-0.04em] text-balance text-foreground sm:text-6xl lg:text-7xl">
          Faster localisation operations <span className="text-foreground/56">powered by AI.</span>
        </h1>

        <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
          Hyperlocalise Cloud helps localisation teams run AI-led translation, route only the work
          that needs human attention, and ship faster with clearer quality signals.
        </p>

        <div className="mt-8 flex w-full max-w-md flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:items-center sm:justify-center">
          <Button
            size="lg"
            className="h-12 w-full bg-primary px-6 text-primary-foreground shadow-[0_12px_30px_rgba(79,180,141,0.24)] sm:min-w-44 sm:w-auto"
            nativeButton={false}
            render={<a href={env.NEXT_PUBLIC_WAITLIST_URL} target="_blank" rel="noreferrer" />}
          >
            Join the cloud waitlist
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="h-12 w-full border-border/70 bg-background/80 px-6 sm:min-w-44 sm:w-auto"
            nativeButton={false}
            render={<a href={githubRepoUrl} target="_blank" rel="noreferrer" />}
          >
            <HugeiconsIcon icon={GithubIcon} strokeWidth={2} />
            Star on GitHub
          </Button>
        </div>
      </div>

      <div className="mx-auto mt-12 w-full max-w-5xl">
        <HeroPreview />
      </div>
    </>
  );
}

function HeroPreview() {
  return (
    <Card className="rounded-[2rem] border border-border/70 bg-card/90 py-0 shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur">
      <CardHeader className="gap-6 border-b border-border/70 px-4 py-5 sm:px-8 sm:py-6 lg:px-10">
        <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 sm:gap-6">
          <Stat label="Runs tracked" value="184" />
          <Stat label="Locales" value="18" />
          <Stat label="Quality gates" value="42" className="hidden sm:flex" />
        </div>
        <CardAction className="col-auto row-auto w-full sm:w-auto">
          <Tooltip>
            <TooltipTrigger className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
              <Badge className="h-11 w-full justify-center bg-foreground px-5 text-sm font-semibold text-background shadow-sm sm:w-auto">
                <HugeiconsIcon icon={Shield01Icon} strokeWidth={2} className="size-4" />
                AI-first workflow
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              A simplified example of how Hyperlocalise Cloud shows progress, review needs, and
              release readiness.
            </TooltipContent>
          </Tooltip>
        </CardAction>
      </CardHeader>

      <CardContent className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="rounded-[1.5rem] border border-border/70 bg-background py-0 shadow-none">
            <CardHeader className="border-b border-border/70 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Example run
                  </div>
                  <div className="mt-1 text-sm font-medium text-foreground">
                    Help center rollout, April batch
                  </div>
                </div>
                <Badge variant="outline" className="border-primary/15 bg-primary/10 text-primary">
                  In review
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 px-5 py-5">
              <div className="rounded-[1.1rem] border border-border/70 bg-muted/30 px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">
                      Source file: `apps/web/src/messages/en.json`
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      124 strings across 6 locales, with glossary rules and product tone applied
                    </div>
                  </div>
                  <Badge variant="outline" className="h-fit w-fit">
                    Synced from GitHub
                  </Badge>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  {
                    title: "AI translation pass",
                    detail:
                      "AI completed the first pass for fr-FR, de-DE, ja-JP, and es-ES in one run",
                    badge: "Completed",
                  },
                  {
                    title: "Review by exception",
                    detail:
                      "12 strings were routed to Crowdin for tone review in French and German",
                    badge: "Only where needed",
                  },
                  {
                    title: "Release check",
                    detail:
                      "A terminology regression was found in ja-JP, so this release is still blocked",
                    badge: "Needs review",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="grid gap-3 rounded-[1.1rem] border border-border/70 bg-background px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div>
                      <div className="text-sm font-semibold text-foreground">{item.title}</div>
                      <div className="mt-1 text-sm leading-6 text-muted-foreground">
                        {item.detail}
                      </div>
                    </div>
                    <Badge variant="outline" className="h-fit border-border/70">
                      {item.badge}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4">
            <Card className="rounded-[1.5rem] border border-border/70 bg-background py-0 shadow-none">
              <CardHeader className="border-b border-border/70 px-5 py-4">
                <CardTitle className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                  Locale status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-5 py-5">
                {dashboardRows.map((row) => (
                  <div
                    key={row.locale}
                    className="grid gap-2 rounded-[1rem] bg-muted/30 px-3 py-3 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-3"
                  >
                    <div className="text-sm font-semibold text-foreground">{row.locale}</div>
                    <div className="text-sm text-muted-foreground sm:min-w-0">{row.progress}</div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "w-fit bg-background sm:justify-self-start",
                        getStatusToneClasses(row.tone),
                      )}
                    >
                      {row.status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-[1.5rem] border border-border/70 bg-background py-0 shadow-none">
              <CardHeader className="border-b border-border/70 px-5 py-4">
                <CardTitle className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                  Release confidence
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 px-5 py-5">
                <Progress value={82} className="gap-2">
                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <ProgressLabel className="text-sm font-medium">
                      Review and eval coverage
                    </ProgressLabel>
                    <span className="text-sm text-muted-foreground tabular-nums sm:ms-auto">
                      82 / 100
                    </span>
                  </div>
                </Progress>

                <div className="rounded-[1rem] bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  Blocked by one terminology regression and two unresolved reviewer comments.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function WorkflowSection() {
  return (
    <section className="grid gap-10 lg:grid-cols-[0.86fr_1.14fr] lg:items-start">
      <div className="pt-3">
        <SectionEyebrow label="How it works" />
        <h2 className="mt-4 max-w-lg font-heading text-4xl leading-[1.04] font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
          A faster path from source content to safe release.
        </h2>
        <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
          Hyperlocalise Cloud turns localisation into a visible workflow instead of a chain of
          manual handoffs. Teams can start from content or code, send output into review, and
          release faster with clearer quality signals.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {workflowSteps.map((step) => (
          <Card
            key={step.label}
            className="rounded-[1.6rem] border border-border/70 bg-background py-0 shadow-none"
          >
            <CardContent className="px-5 py-5 sm:px-6 sm:py-6">
              <div className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {step.label}
              </div>
              <div className="mt-3 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-primary">
                {step.meta}
              </div>
              <div className="mt-4 text-xl font-semibold tracking-[-0.03em] text-foreground">
                {step.title}
              </div>
              <div className="mt-3 text-sm leading-6 text-muted-foreground">{step.description}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function ValueSection() {
  return (
    <section className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
      <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
        {valueCards.map((card) => (
          <Card
            key={card.title}
            className={cn(
              "rounded-[1.8rem] border border-border/70 bg-background py-0 shadow-none",
              card.className,
            )}
          >
            <CardContent className="px-6 py-6">
              <div className="mb-10 flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <HugeiconsIcon icon={card.icon} strokeWidth={2} className="size-5" />
              </div>
              <div className="font-heading text-2xl font-semibold tracking-[-0.04em] text-foreground">
                {card.title}
              </div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">{card.description}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col justify-center lg:pl-6">
        <SectionEyebrow label="Why teams use it" />
        <h2 className="mt-4 max-w-lg font-heading text-4xl leading-[1.02] font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
          Faster localisation without losing control.
        </h2>

        <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
          Hyperlocalise Cloud gives localisation teams one system for AI translation, selective
          review, and release checks. Teams spend less time coordinating handoffs and more time
          shipping confidently.
        </p>

        <ItemGroup className="mt-8 gap-3">
          {[
            "Speed up the first pass with AI agents that translate, route, and track work",
            "Send only higher-risk content into human review",
            "Catch regressions early so faster releases do not lower quality",
          ].map((item) => (
            <Item
              key={item}
              variant="outline"
              size="sm"
              className="w-full max-w-full rounded-3xl border-border/70 bg-background/70 pr-4 sm:w-fit sm:rounded-full"
            >
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                strokeWidth={2}
                className="size-4 text-primary"
              />
              <ItemContent className="min-w-0">
                <ItemTitle className="w-full text-sm font-medium">{item}</ItemTitle>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </div>
    </section>
  );
}

function DashboardSection() {
  return (
    <section className="grid gap-10 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
      <div className="pt-3">
        <SectionEyebrow label="Run history and analytics" />
        <h2 className="mt-4 max-w-lg font-heading text-4xl leading-[1.04] font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
          The dashboard turns speed into release confidence.
        </h2>
        <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
          Past runs, locale status, review progress, quality signals, and regressions live in one
          view, so localisation teams can move quickly without losing track of what is safe to
          release.
        </p>

        <ItemGroup className="mt-8 gap-5">
          <InsightItem
            icon={InformationCircleIcon}
            title="Past runs stay inspectable"
            description="See what changed between runs, which model path was used, and how approvals changed over time."
          />
          <InsightItem
            icon={Alert02Icon}
            title="Quality signals are visible before launch"
            description="Track failed quality checks, review bottlenecks, and regression flags before they turn into release risk."
          />
        </ItemGroup>
      </div>

      <Card className="rounded-[1.75rem] border border-border/70 bg-background py-0 shadow-[0_24px_70px_rgba(15,23,42,0.07)]">
        <CardHeader className="border-b border-border/70 px-6 py-5">
          <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-[0.18em] text-muted-foreground">
            <HugeiconsIcon
              icon={InformationCircleIcon}
              strokeWidth={2}
              className="size-4 text-primary"
            />
            Release dashboard
          </CardTitle>
          <CardDescription>
            Review progress, quality status, and release readiness across every locale in one view.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 px-4 py-5 sm:px-6 sm:py-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Past runs" value="184" />
            <MetricCard label="Locales active" value="18" />
            <MetricCard label="Checks passing" value="39/42" />
          </div>

          <Progress value={82} className="gap-2">
            <div className="flex w-full items-center gap-3">
              <ProgressLabel className="text-sm font-medium">
                Release readiness based on review and quality checks
              </ProgressLabel>
              <span className="ms-auto text-sm text-muted-foreground tabular-nums">82 / 100</span>
            </div>
          </Progress>

          <Separator />

          <div className="space-y-3">
            {dashboardRows.map((row) => (
              <div
                key={row.locale}
                className="grid gap-3 rounded-[1.1rem] bg-muted/35 px-4 py-4 sm:px-5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{row.locale}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{row.progress}</div>
                </div>
                <div className="sm:justify-self-center">
                  <Badge
                    variant="outline"
                    className={cn("w-fit bg-background/80", getStatusToneClasses(row.tone))}
                  >
                    {row.status}
                  </Badge>
                </div>
                <div
                  className={cn(
                    "text-sm text-muted-foreground sm:justify-self-end",
                    getSignalToneClasses(row.tone),
                  )}
                >
                  {row.signal}
                </div>
              </div>
            ))}
          </div>

          <Field
            orientation="horizontal"
            className="items-start rounded-[1.2rem] border border-border/70 bg-muted/40 px-4 py-4 sm:items-center"
          >
            <Switch checked size="default" aria-label="Block release until quality checks pass" />
            <FieldContent>
              <FieldTitle>Block release until quality checks pass</FieldTitle>
              <FieldDescription>
                Keep this release blocked when regressions are still open or review coverage is
                incomplete.
              </FieldDescription>
            </FieldContent>
          </Field>
        </CardContent>
      </Card>
    </section>
  );
}

function TeamSection() {
  return (
    <section className="flex flex-col items-center text-center">
      <ButtonGroup className="mb-6 gap-3">
        <ButtonGroupText className="h-8 border border-primary/15 bg-primary/8 px-4 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-primary">
          <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={2} className="size-3.5" />
          Built for localisation teams
        </ButtonGroupText>
      </ButtonGroup>

      <h2 className="max-w-4xl font-heading text-4xl leading-[1.02] font-semibold tracking-[-0.04em] text-balance sm:text-5xl lg:text-6xl">
        Made for localisation operations, with the integrations engineering expects.
      </h2>

      <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
        Hyperlocalise Cloud is designed for localisation teams that need speed, visibility, and
        review control without adding more process overhead for engineering. The open-source
        foundation is available now, and the hosted product is the next step.
      </p>

      <div className="mt-10 grid w-full gap-4 text-left lg:grid-cols-2">
        {teamCards.map((card) => (
          <Card
            key={card.title}
            className="rounded-[1.5rem] border border-border/70 bg-background py-0 shadow-none"
          >
            <CardContent className="px-6 py-6">
              <div className="mb-6 flex size-11 items-center justify-center rounded-2xl bg-muted text-foreground">
                <HugeiconsIcon icon={card.icon} strokeWidth={2} className="size-5" />
              </div>
              <div className="font-heading text-2xl font-semibold tracking-[-0.04em] text-foreground">
                {card.title}
              </div>
              <div className="mt-3 text-sm leading-6 text-muted-foreground">{card.description}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 flex w-full max-w-md flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:items-center sm:justify-center">
        <Button
          size="lg"
          className="h-12 w-full bg-foreground px-6 text-background sm:min-w-60 sm:w-auto"
          nativeButton={false}
          render={<a href={env.NEXT_PUBLIC_WAITLIST_URL} target="_blank" rel="noreferrer" />}
        >
          Join the cloud waitlist
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="h-12 w-full px-6 sm:min-w-44 sm:w-auto"
          nativeButton={false}
          render={<a href={githubRepoUrl} target="_blank" rel="noreferrer" />}
        >
          <HugeiconsIcon icon={GithubIcon} strokeWidth={2} />
          Star on GitHub
        </Button>
      </div>

      <div className="mt-10 grid w-full gap-3 text-left sm:max-w-3xl sm:grid-cols-3">
        <TrustNote
          icon={Shield01Icon}
          title="Open source foundation"
          description="Start with the core workflow today and see how Hyperlocalise fits into your stack."
        />
        <TrustNote
          icon={Tick02Icon}
          title="Faster operations"
          description="Move work through translation, review, and release checks without stitching together extra tools."
        />
        <TrustNote
          icon={Alert02Icon}
          title="Hosted product coming next"
          description="Join early access for the hosted product built for localisation teams that need more speed and control."
        />
      </div>

      <Separator className="mt-14 mb-6 w-full" />

      <footer className="flex w-full flex-col items-center justify-between gap-4 text-center text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:flex-row sm:text-left">
        <span>© 2026 Hyperlocalise. All rights reserved.</span>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 sm:justify-end">
          {footerLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </div>
      </footer>
    </section>
  );
}

function SectionEyebrow({ label }: { label: string }) {
  return (
    <Badge
      variant="outline"
      className="h-8 w-fit border-primary/15 bg-primary/8 px-4 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-primary"
    >
      <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} className="size-3.5" />
      {label}
    </Badge>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span className="font-heading text-2xl font-semibold tracking-[-0.04em] text-foreground sm:text-3xl">
        {value}
      </span>
    </div>
  );
}

function InsightItem({
  icon,
  title,
  description,
}: {
  icon: IconSvgElement;
  title: string;
  description: string;
}) {
  return (
    <Item variant="default" className="gap-4 rounded-none border-none px-0 py-0">
      <ItemActions className="mt-1 flex size-12 items-center justify-center rounded-2xl bg-muted text-foreground">
        <HugeiconsIcon icon={icon} strokeWidth={2} className="size-5" />
      </ItemActions>
      <ItemContent className="gap-2">
        <ItemTitle className="text-xl font-semibold tracking-[-0.03em]">{title}</ItemTitle>
        <ItemDescription className="max-w-xl text-base leading-7">{description}</ItemDescription>
      </ItemContent>
    </Item>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="gap-2 rounded-[1.2rem] border border-border/70 bg-muted/35 py-4 shadow-none">
      <CardContent className="px-4">
        <div className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </div>
        <div className="mt-2 font-heading text-2xl font-semibold tracking-[-0.04em]">{value}</div>
      </CardContent>
    </Card>
  );
}

function TrustNote({
  icon,
  title,
  description,
}: {
  icon: IconSvgElement;
  title: string;
  description: string;
}) {
  return (
    <Item
      variant="outline"
      size="sm"
      className="rounded-[1.2rem] border-border/70 bg-background/70 p-4"
    >
      <ItemActions className="rounded-full bg-primary/10 p-2 text-primary">
        <HugeiconsIcon icon={icon} strokeWidth={2} className="size-4" />
      </ItemActions>
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
    </Item>
  );
}
