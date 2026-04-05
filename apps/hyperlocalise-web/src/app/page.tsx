import {
  Add01Icon,
  AiSecurity02Icon,
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

const workflowSteps = [
  {
    label: "01",
    title: "Upload content or connect your app",
    description:
      "Start from product copy, docs, JSON, or a GitHub-connected workflow so work begins where your team already operates.",
    meta: "Files, API, and GitHub",
  },
  {
    label: "02",
    title: "Translate with your model of choice",
    description:
      "Run AI translation at scale, compare models when needed, and keep prompts and glossary context consistent across every locale.",
    meta: "Model flexibility",
  },
  {
    label: "03",
    title: "Review with human-in-the-loop",
    description:
      "Sync into Crowdin or your TMS of choice so reviewers stay in the loop with locale notes, glossary context, and full decision history.",
    meta: "Review operations",
  },
  {
    label: "04",
    title: "Track quality and ship safely",
    description:
      "Use evals, regressions, and release gates to see what changed, what passed, and what still needs attention before launch.",
    meta: "Quality control",
  },
];

const valueCards = [
  {
    icon: SparklesIcon,
    title: "Move faster with agentic AI runs",
    description:
      "Let AI handle the first pass, routing, and follow-up checks so localisation teams can move faster without coordinating every step by hand.",
    className: "",
  },
  {
    icon: LinkSquare02Icon,
    title: "TMS integration that keeps humans in the loop",
    description:
      "Sync into Crowdin or your TMS while keeping review decisions, context, and approvals attached as AI speeds up the first pass.",
    className: "",
  },
  {
    icon: Alert02Icon,
    title: "Evals and regression checks before release",
    description:
      "Catch quality drops across locales and model changes before they ship, so faster output does not create slower clean-up later.",
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
    title: "For localisation operations",
    description:
      "Run faster translation cycles, keep reviewers aligned, and track release readiness across locales from one operational view.",
  },
  {
    icon: CheckmarkCircle02Icon,
    title: "With the integrations engineering expects",
    description:
      "Connect through API and GitHub, keep source changes close to the workflow, and avoid breaking the systems your product teams already use.",
  },
];

const dashboardRows = [
  {
    locale: "fr-FR",
    status: "Ready to ship",
    progress: "12/12 reviewed",
    signal: "Eval pass",
  },
  {
    locale: "de-DE",
    status: "Needs review",
    progress: "8/12 reviewed",
    signal: "Tone drift flagged",
  },
  {
    locale: "ja-JP",
    status: "Blocked",
    progress: "Regression open",
    signal: "Terminology mismatch",
  },
];

const githubRepoUrl = "https://github.com/hyperlocalise/hyperlocalise";

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="relative isolate">
        <div className="absolute inset-x-0 top-0 -z-10 h-[38rem] bg-[radial-gradient(circle_at_top,rgba(79,180,141,0.16),transparent_58%)]" />
        <div className="absolute inset-x-0 top-40 -z-10 h-[30rem] bg-[radial-gradient(circle_at_center,rgba(79,180,141,0.08),transparent_62%)]" />

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
    </main>
  );
}

function Hero() {
  return (
    <>
      <div className="mx-auto flex max-w-4xl flex-col items-center text-center">

        <h1 className="max-w-5xl font-heading text-5xl leading-[0.94] font-semibold tracking-[-0.04em] text-balance text-foreground sm:text-6xl lg:text-7xl">
          Faster localisation operations, powered by <span className="text-foreground/42">agentic AI.</span>
        </h1>

        <p className="mt-6 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
          Hyperlocalise Cloud helps localisation teams speed up AI translation, keep human review
          in the loop, and ship with more confidence, on top of the open-source foundation
          available today.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Button
            size="lg"
            className="h-12 min-w-44 bg-primary px-6 text-primary-foreground shadow-[0_12px_30px_rgba(79,180,141,0.24)]"
          >
            Join the waitlist
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="h-12 min-w-44 border-border/70 bg-background/80 px-6"
            nativeButton={false}
            render={<a href={githubRepoUrl} target="_blank" rel="noreferrer" />}
          >
            <HugeiconsIcon icon={GithubIcon} strokeWidth={2} />
            Star on GitHub
          </Button>
        </div>
      </div>

      <div className="mx-auto mt-14 w-full max-w-6xl">
        <HeroPreview />
      </div>
    </>
  );
}

function HeroPreview() {
  return (
    <Card className="rounded-[2rem] border border-border/70 bg-card/90 py-0 shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur">
      <CardHeader className="gap-6 border-b border-border/70 px-6 py-6 sm:px-8 lg:px-10">
        <div className="grid flex-1 grid-cols-2 gap-6 sm:grid-cols-4">
          <Stat label="Runs tracked" value="184" />
          <Stat label="Locales" value="18" />
          <Stat label="Reviews live" value="27" className="hidden sm:flex" />
          <Stat label="Quality gates" value="42" className="hidden sm:flex" />
        </div>
        <CardAction className="col-auto row-auto">
          <Tooltip>
            <TooltipTrigger className="outline-none">
              <Badge className="h-11 bg-foreground px-5 text-sm font-semibold text-background shadow-sm">
                <HugeiconsIcon icon={Shield01Icon} strokeWidth={2} className="size-4" />
                Preview workflow
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              A preview of how runs, review, and release confidence can look in Hyperlocalise
              Cloud.
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
                    Current run
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
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      Source: `apps/web/src/messages/en.json`
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      124 strings, 6 locales, glossary rules and product tone applied
                    </div>
                  </div>
                  <Badge variant="outline">GitHub sync</Badge>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  {
                    title: "Model pass",
                    detail: "AI completed the first pass across fr-FR, de-DE, ja-JP, and es-ES in one run",
                    badge: "Completed",
                  },
                  {
                    title: "Human review",
                    detail: "12 strings synced to Crowdin for tone review in French and German",
                    badge: "Active",
                  },
                  {
                    title: "Quality gate",
                    detail: "One terminology regression found in ja-JP, so release is still blocked",
                    badge: "Needs attention",
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
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[1rem] bg-muted/30 px-3 py-3"
                  >
                    <div className="text-sm font-semibold text-foreground">{row.locale}</div>
                    <div className="text-sm text-muted-foreground">{row.progress}</div>
                    <Badge variant="outline" className="border-primary/15 bg-background">
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
                  <div className="flex w-full items-center gap-3">
                    <ProgressLabel className="text-sm font-medium">
                      Review and eval coverage
                    </ProgressLabel>
                    <span className="ms-auto text-sm text-muted-foreground tabular-nums">
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
          Hyperlocalise Cloud turns localisation into a visible operating flow instead of a chain
          of manual handoffs. Teams can start from content or code, route output into review, and
          ship faster with clearer signals about quality.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {workflowSteps.map((step) => (
          <Card
            key={step.label}
            className="rounded-[1.6rem] border border-border/70 bg-background py-0 shadow-none"
          >
            <CardContent className="px-6 py-6">
              <div className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {step.label}
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
          Hyperlocalise Cloud helps localisation teams use agentic AI to accelerate translation,
          review routing, and quality checks in one system. The result is faster turnaround,
          lighter operations overhead, and more confidence in what is ready to ship.
        </p>

        <ItemGroup className="mt-8 gap-3">
          {[
            "Speed up the first pass with AI agents that translate, route, and track work",
            "Keep human review in the loop instead of replacing it",
            "Catch regressions early so faster releases do not mean lower quality",
          ].map((item) => (
            <Item
              key={item}
              variant="outline"
              size="sm"
              className="w-fit max-w-full rounded-full border-border/70 bg-background/70 pr-4"
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
          The dashboard is where speed becomes operational confidence.
        </h2>
        <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
          Past runs, locale status, review progress, quality signals, and regression visibility all
          live in one view so localisation teams can move quickly without losing track of what is
          safe to release.
        </p>

        <ItemGroup className="mt-8 gap-5">
          <InsightItem
            icon={InformationCircleIcon}
            title="Past runs stay inspectable"
            description="See what changed between runs, what model path was used, and how approvals moved over time."
          />
          <InsightItem
            icon={Alert02Icon}
            title="Quality signals are visible before launch"
            description="Track eval failures, review bottlenecks, and regression flags before they turn into release risk."
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
            Review progress, quality status, and release confidence across every locale in one
            place.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 px-6 py-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Past runs" value="184" />
            <MetricCard label="Locales active" value="18" />
            <MetricCard label="Checks passing" value="39/42" />
          </div>

          <Progress value={82} className="gap-2">
            <div className="flex w-full items-center gap-3">
              <ProgressLabel className="text-sm font-medium">
                Release confidence across review and eval gates
              </ProgressLabel>
              <span className="ms-auto text-sm text-muted-foreground tabular-nums">82 / 100</span>
            </div>
          </Progress>

          <Separator />

          <div className="space-y-3">
            {dashboardRows.map((row) => (
              <div
                key={row.locale}
                className="grid gap-3 rounded-[1.1rem] bg-muted/35 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{row.locale}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{row.progress}</div>
                </div>
                <div className="sm:justify-self-center">
                  <Badge
                    variant="outline"
                    className="border-primary/15 bg-primary/10 text-primary"
                  >
                    {row.status}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground sm:justify-self-end">{row.signal}</div>
              </div>
            ))}
          </div>

          <Field
            orientation="horizontal"
            className="items-center rounded-[1.2rem] border border-border/70 bg-muted/40 px-4 py-4"
          >
            <Switch checked size="default" aria-label="Require quality gate before release" />
            <FieldContent>
              <FieldTitle>Require quality gate before release</FieldTitle>
              <FieldDescription>
                Stop rollout when regressions remain open or review coverage is incomplete.
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
          Built for localisation teams first
        </ButtonGroupText>
      </ButtonGroup>

      <h2 className="max-w-4xl font-heading text-4xl leading-[1.02] font-semibold tracking-[-0.04em] text-balance sm:text-5xl lg:text-6xl">
        Made for localisation operations, with integrations engineering expects.
      </h2>

      <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
        Hyperlocalise Cloud is designed for localisation teams that need speed, visibility, and
        review control, without creating more process debt for engineering. The open-source
        foundation is available now, and the hosted layer is the next step.
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

      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <Button size="lg" className="h-12 min-w-60 bg-foreground px-6 text-background">
          Join the waitlist
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="h-12 min-w-44 px-6"
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
          description="Start with the core workflow today and see how Hyperlocalise fits your stack."
        />
        <TrustNote
          icon={Tick02Icon}
          title="Faster operations"
          description="Move work through translation, review, and release checks without stitching together extra steps."
        />
        <TrustNote
          icon={Alert02Icon}
          title="Cloud is next"
          description="Join early access for the hosted layer built for localisation teams that need more speed and control."
        />
      </div>

      <Separator className="mt-14 mb-6 w-full" />

      <footer className="flex w-full flex-col items-center justify-between gap-4 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:flex-row">
        <span>© 2026 Hyperlocalise. All rights reserved.</span>
        <div className="flex items-center gap-5">
          <span>Privacy</span>
          <span>Terms</span>
          <span>Contact</span>
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
      <span className="font-heading text-3xl font-semibold tracking-[-0.04em] text-foreground">
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
