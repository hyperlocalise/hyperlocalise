import Link from "next/link";
import { ArrowRightIcon, CheckCircle2Icon } from "lucide-react";

import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { cn } from "@/lib/primitives/cn";

import type { ProductPageContent, ProductVisualKind } from "./product-page-content";

type ProductPageProps = {
  content: ProductPageContent;
};

function ProductEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">{children}</div>
  );
}

function LinkRail({ title, links }: { title: string; links: ProductPageContent["related"] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
        {title}
      </div>
      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <Button
            key={link.href}
            variant="outline"
            size="sm"
            className="rounded-full"
            nativeButton={false}
            render={<Link href={link.href} />}
          >
            {link.label}
            <ArrowRightIcon data-icon="inline-end" className="size-3.5" />
          </Button>
        ))}
      </div>
    </div>
  );
}

function ProductHero({ content }: ProductPageProps) {
  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(31rem,1.08fr)] lg:items-end">
      <div className="flex max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-5">
          <ProductEyebrow>{content.hero.eyebrow}</ProductEyebrow>
          <h1 className="max-w-4xl font-heading text-[clamp(2.9rem,7vw,5.8rem)] leading-[0.96] font-semibold tracking-normal text-balance">
            {content.hero.headline}
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
            {content.hero.subcopy}
          </p>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Button size="lg" nativeButton={false} render={<a href={env.NEXT_PUBLIC_WAITLIST_URL} />}>
            Join waitlist
            <ArrowRightIcon data-icon="inline-end" className="size-4" />
          </Button>
          <Button variant="ghost" size="lg" nativeButton={false} render={<Link href="/" />}>
            Back to homepage
          </Button>
        </div>
      </div>
      <ProductVisual kind={content.visualKind} variant="primary" />
    </div>
  );
}

function AutomationPrimaryVisual() {
  const sources = ["GitHub", "Slack", "CMS"];
  const destinations = ["Reviewer", "TMS", "Release"];

  return (
    <div className="relative overflow-hidden rounded-lg border border-border/70 bg-card p-4 shadow-2xl shadow-foreground/5">
      <div className="mb-4 flex items-center justify-between border-b border-border/70 pb-3">
        <div>
          <div className="text-sm font-semibold">Launch request</div>
          <div className="text-xs text-muted-foreground">FR, DE, JA waiting on scope</div>
        </div>
        <div className="rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success-foreground dark:text-success">
          Running
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-[0.8fr_1.15fr_0.8fr]">
        <div className="flex flex-col gap-2">
          {sources.map((source) => (
            <div key={source} className="rounded-md border border-border/70 bg-background p-3">
              <div className="text-xs text-muted-foreground">Signal</div>
              <div className="text-sm font-semibold">{source}</div>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-primary/25 bg-primary/8 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Hyperlocalise agent</div>
              <div className="text-xs text-muted-foreground">Scope, context, route</div>
            </div>
            <div className="size-2 rounded-full bg-primary" />
          </div>
          <div className="space-y-2">
            {["Detect changed strings", "Attach product context", "Create reviewer tasks"].map(
              (item) => (
                <div
                  key={item}
                  className="flex items-center gap-2 rounded-md bg-background/80 px-3 py-2 text-xs"
                >
                  <CheckCircle2Icon className="size-3.5 text-primary" />
                  {item}
                </div>
              ),
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {destinations.map((destination) => (
            <div key={destination} className="rounded-md border border-border/70 bg-background p-3">
              <div className="text-xs text-muted-foreground">Route</div>
              <div className="text-sm font-semibold">{destination}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CatPrimaryVisual() {
  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-2xl shadow-foreground/5">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <div>
          <div className="text-sm font-semibold">Checkout copy</div>
          <div className="text-xs text-muted-foreground">12 strings selected for French review</div>
        </div>
        <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          QA ready
        </div>
      </div>
      <div className="grid min-h-[25rem] md:grid-cols-[12rem_minmax(0,1fr)_14rem]">
        <div className="border-b border-border/70 bg-muted/25 p-3 md:border-r md:border-b-0">
          <div className="mb-3 text-xs font-semibold text-muted-foreground uppercase">Queue</div>
          {["Payment title", "Trial banner", "Upgrade CTA", "Legal note"].map((item, index) => (
            <div
              key={item}
              className={cn(
                "mb-2 rounded-md border px-3 py-2 text-xs",
                index === 1
                  ? "border-primary/35 bg-primary/10 text-foreground"
                  : "border-border/60 bg-background text-muted-foreground",
              )}
            >
              {item}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-4 p-4">
          <div className="rounded-md border border-border/70 bg-background p-4">
            <div className="mb-2 text-xs text-muted-foreground">Source</div>
            <div className="text-lg font-semibold">Start your global rollout today</div>
          </div>
          <div className="rounded-md border border-primary/30 bg-primary/8 p-4">
            <div className="mb-2 text-xs text-muted-foreground">Target: fr-FR</div>
            <div className="text-lg font-semibold">
              Lancez votre deploiement mondial aujourd'hui
            </div>
          </div>
          <div className="rounded-md border border-border/70 bg-background p-4">
            <div className="mb-2 text-xs font-semibold text-primary">AI review note</div>
            <p className="text-sm leading-6 text-muted-foreground">
              Keep "rollout" aligned with the product launch glossary. Tone matches onboarding copy.
            </p>
          </div>
        </div>
        <div className="border-t border-border/70 bg-muted/20 p-3 md:border-t-0 md:border-l">
          <div className="mb-3 text-xs font-semibold text-muted-foreground uppercase">Context</div>
          {[
            "Glossary: rollout",
            "Screen: upgrade modal",
            "Voice: direct",
            "Quality: no warnings",
          ].map((item) => (
            <div key={item} className="mb-2 rounded-md bg-background px-3 py-2 text-xs">
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KnowledgePrimaryVisual() {
  const nodes = ["Product docs", "Glossary", "Translations", "Reviewers", "Markets", "Agents"];

  return (
    <div className="rounded-lg border border-border/70 bg-card p-5 shadow-2xl shadow-foreground/5">
      <div className="mb-6 flex items-center justify-between border-b border-border/70 pb-4">
        <div>
          <div className="text-sm font-semibold">Localisation memory layer</div>
          <div className="text-xs text-muted-foreground">Signals captured from approved work</div>
        </div>
        <div className="rounded-full bg-secondary/25 px-3 py-1 text-xs font-medium">Learning</div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {nodes.map((node, index) => (
          <div
            key={node}
            className={cn(
              "rounded-lg border p-4",
              index === 2 ? "border-primary/35 bg-primary/10" : "border-border/70 bg-background",
            )}
          >
            <div className="mb-8 size-2 rounded-full bg-primary" />
            <div className="text-sm font-semibold">{node}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {index === 2 ? "Approved source of truth" : "Context signal"}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-border/70 bg-muted/25 p-4">
        <div className="text-xs font-semibold text-muted-foreground uppercase">Latest decision</div>
        <div className="mt-2 text-sm">
          Prefer market-specific idioms for onboarding CTAs, but keep product terms literal.
        </div>
      </div>
    </div>
  );
}

function ProductVisual({
  kind,
  variant,
}: {
  kind: ProductVisualKind;
  variant: "primary" | "secondary";
}) {
  if (variant === "primary") {
    if (kind === "automation") {
      return <AutomationPrimaryVisual />;
    }

    if (kind === "cat") {
      return <CatPrimaryVisual />;
    }

    return <KnowledgePrimaryVisual />;
  }

  return <SecondaryVisual kind={kind} />;
}

function SecondaryVisual({ kind }: { kind: ProductVisualKind }) {
  const rowsByKind: Record<ProductVisualKind, { title: string; meta: string }[]> = {
    automation: [
      { title: "Source change detected", meta: "GitHub pull request" },
      { title: "Reviewer task created", meta: "French launch copy" },
      { title: "Approved strings synced", meta: "Crowdin and release branch" },
    ],
    cat: [
      { title: "Glossary warning", meta: "Use approved product term" },
      { title: "Comment resolved", meta: "Reviewer accepted edit" },
      { title: "Ready to approve", meta: "No quality warnings" },
    ],
    knowledge: [
      { title: "Reviewer correction saved", meta: "Tone preference for Japan" },
      { title: "Glossary decision reused", meta: "Checkout terminology" },
      { title: "Market rule applied", meta: "Spanish formal voice" },
    ],
  };

  return (
    <div className="rounded-lg border border-border/70 bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">
            {kind === "automation"
              ? "Workflow state"
              : kind === "cat"
                ? "Review quality"
                : "Knowledge updates"}
          </div>
          <div className="text-xs text-muted-foreground">Focused supporting view</div>
        </div>
        <div className="size-2 rounded-full bg-primary" />
      </div>
      <div className="space-y-2">
        {rowsByKind[kind].map((row) => (
          <div
            key={row.title}
            className="flex items-start justify-between gap-4 rounded-md border border-border/70 bg-background p-3"
          >
            <div>
              <div className="text-sm font-semibold">{row.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{row.meta}</div>
            </div>
            <CheckCircle2Icon className="mt-0.5 size-4 text-primary" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductExplanation({ content }: ProductPageProps) {
  return (
    <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
      <div className="max-w-xl">
        <ProductEyebrow>{content.explanation.label}</ProductEyebrow>
        <h2 className="mt-4 font-heading text-3xl leading-tight font-semibold tracking-normal sm:text-4xl">
          {content.explanation.title}
        </h2>
      </div>
      <p className="max-w-3xl text-lg leading-8 text-muted-foreground">
        {content.explanation.body}
      </p>
    </div>
  );
}

function ProcessSection({ content }: ProductPageProps) {
  return (
    <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
      <div className="flex max-w-xl flex-col gap-4">
        <ProductEyebrow>{content.process.label}</ProductEyebrow>
        <h2 className="font-heading text-3xl leading-tight font-semibold tracking-normal sm:text-4xl">
          {content.process.title}
        </h2>
      </div>
      <div className="grid gap-2">
        {content.process.steps.map((step, index) => (
          <div
            key={step}
            className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-4 rounded-lg border border-border/70 bg-card p-4"
          >
            <div className="flex size-10 items-center justify-center rounded-full bg-muted text-sm font-semibold">
              {String(index + 1).padStart(2, "0")}
            </div>
            <div className="text-base font-semibold">{step}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CapabilitiesSection({ content }: ProductPageProps) {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div>
        <ProductEyebrow>{content.capabilities.label}</ProductEyebrow>
        <h2 className="mt-4 max-w-2xl font-heading text-3xl leading-tight font-semibold tracking-normal sm:text-4xl">
          {content.capabilities.title}
        </h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {content.capabilities.items.map((item) => (
            <div key={item} className="rounded-lg border border-border/70 bg-card p-4">
              <CheckCircle2Icon className="mb-4 size-4 text-primary" />
              <div className="text-sm font-semibold leading-6">{item}</div>
            </div>
          ))}
        </div>
      </div>
      <ProductVisual kind={content.visualKind} variant="secondary" />
    </div>
  );
}

function WhyItMattersSection({ content }: ProductPageProps) {
  return (
    <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
      <div className="max-w-xl">
        <ProductEyebrow>{content.whyItMatters.label}</ProductEyebrow>
        <h2 className="mt-4 font-heading text-3xl leading-tight font-semibold tracking-normal sm:text-4xl">
          {content.whyItMatters.title}
        </h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {content.whyItMatters.items.map((item) => (
          <div key={item} className="rounded-lg border border-border/70 bg-card p-5">
            <div className="text-base font-semibold leading-7">{item}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductCta({ content }: ProductPageProps) {
  return (
    <div className="grid gap-10 rounded-lg border border-border/70 bg-card p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
      <div className="max-w-3xl">
        <h2 className="font-heading text-3xl leading-tight font-semibold tracking-normal sm:text-4xl">
          {content.cta.headline}
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
          {content.cta.description}
        </p>
      </div>
      <Button size="lg" nativeButton={false} render={<a href={env.NEXT_PUBLIC_WAITLIST_URL} />}>
        Join waitlist
        <ArrowRightIcon data-icon="inline-end" className="size-4" />
      </Button>
    </div>
  );
}

function ProductInternalLinks({ content }: ProductPageProps) {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <LinkRail title="Explore product" links={content.related} />
      <LinkRail title="Resources" links={content.resources} />
    </div>
  );
}

export function ProductPage({ content }: ProductPageProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-7xl">
        <section className="px-5 pb-14 pt-8 sm:px-8 lg:px-10 lg:pt-10">
          <ProductHero content={content} />
        </section>

        <section className="border-t border-border/70 px-5 py-16 sm:px-8 lg:px-10">
          <ProductExplanation content={content} />
        </section>

        <section className="border-t border-border/70 px-5 py-20 sm:px-8 lg:px-10">
          <ProcessSection content={content} />
        </section>

        <section className="border-t border-border/70 px-5 py-20 sm:px-8 lg:px-10">
          <CapabilitiesSection content={content} />
        </section>

        <section className="border-t border-border/70 px-5 py-20 sm:px-8 lg:px-10">
          <WhyItMattersSection content={content} />
        </section>

        <section className="border-t border-border/70 px-5 py-16 sm:px-8 lg:px-10">
          <ProductInternalLinks content={content} />
        </section>

        <section className="border-t border-border/70 px-5 py-24 sm:px-8 lg:px-10">
          <ProductCta content={content} />
        </section>

        <section className="border-t border-border/70 px-5 py-16 sm:px-8 lg:px-10">
          <MarketingFooter columns={footerColumns} />
        </section>
      </main>
    </div>
  );
}
