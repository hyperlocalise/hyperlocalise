import Link from "next/link";
import { ArrowRightIcon, CheckCircle2Icon } from "lucide-react";

import { HeroFrame } from "@/components/marketing/hero-frame";
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

function ProductHero({ content }: ProductPageProps) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 text-center">
      <div className="flex flex-col items-center gap-5">
        <h1 className="max-w-4xl font-heading text-[clamp(2.5rem,5vw,4.75rem)] leading-[1] font-semibold tracking-normal text-balance">
          {content.hero.headline}
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-muted-foreground text-balance sm:text-xl">
          {content.hero.subcopy}
        </p>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Button size="lg" nativeButton={false} render={<a href={env.NEXT_PUBLIC_WAITLIST_URL} />}>
          Join waitlist
          <ArrowRightIcon data-icon="inline-end" className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function AutomationPrimaryVisual() {
  const sources = ["GitHub", "Slack", "CMS"];
  const destinations = ["Reviewer", "TMS", "Release"];

  return (
    <div className="relative h-full overflow-hidden rounded-lg border border-border/70 bg-card p-4 shadow-2xl shadow-foreground/5">
      <div className="mb-4 flex items-center justify-between border-b border-border/70 pb-3">
        <div>
          <div className="text-sm font-semibold">Launch request</div>
          <div className="text-xs text-muted-foreground">FR, DE, JA waiting on scope</div>
        </div>
        <div className="rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success-foreground dark:text-success">
          Running
        </div>
      </div>
      <div className="grid h-[calc(100%-4.5rem)] min-h-[24rem] gap-3 md:grid-cols-[0.8fr_1.15fr_0.8fr]">
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

function KnowledgePrimaryVisual() {
  const nodes = ["Product docs", "Glossary", "Translations", "Reviewers", "Markets", "Agents"];

  return (
    <div className="h-full rounded-lg border border-border/70 bg-card p-5 shadow-2xl shadow-foreground/5">
      <div className="mb-6 flex items-center justify-between border-b border-border/70 pb-4">
        <div>
          <div className="text-sm font-semibold">Localisation memory layer</div>
          <div className="text-xs text-muted-foreground">Signals captured from approved work</div>
        </div>
        <div className="rounded-full bg-secondary/25 px-3 py-1 text-xs font-medium">Learning</div>
      </div>
      <div className="grid min-h-[20rem] gap-3 sm:grid-cols-3">
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

function ProductVisual({ kind }: { kind: ProductVisualKind }) {
  if (kind === "automation") {
    return <AutomationPrimaryVisual />;
  }

  return <KnowledgePrimaryVisual />;
}

function ProductShowcase({ content }: ProductPageProps) {
  if (content.visualKind === "cat") {
    return (
      <div className="mx-auto max-w-6xl">
        <HeroFrame />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-[8%] -top-8 -bottom-10 rounded-lg bg-[radial-gradient(circle_at_top,rgba(96,116,9,0.16),transparent_58%),radial-gradient(circle_at_bottom_right,rgba(9,108,229,0.1),transparent_46%)] blur-3xl"
        />
        <div className="relative grid min-h-[32rem] overflow-hidden rounded-lg border border-border/70 bg-background p-2 shadow-2xl shadow-foreground/5 sm:min-h-[38rem] sm:p-3 lg:min-h-[42rem]">
          <ProductVisual kind={content.visualKind} />
        </div>
      </div>
    </div>
  );
}

function ProductDetailsSection({ content }: ProductPageProps) {
  return (
    <div className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
      <div className="max-w-xl lg:sticky lg:top-24">
        <ProductEyebrow>How it works</ProductEyebrow>
        <h2 className="mt-5 font-heading text-3xl leading-tight font-semibold tracking-normal text-balance sm:text-4xl">
          {content.detailsHeadline}
        </h2>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">{content.summary}</p>
      </div>

      <div className="divide-y divide-border/70 border-y border-border/70">
        {content.proofPoints.map((point) => (
          <div key={point.title} className="grid gap-3 py-8 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <div className="text-base font-semibold leading-7">{point.title}</div>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground">{point.body}</p>
          </div>
        ))}

        <div className="flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-base font-semibold leading-7">Explore the rest</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Move between the product pillars without leaving the feature-page flow.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {content.related.map((link) => (
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
      </div>
    </div>
  );
}

function ProductCta({ content }: ProductPageProps) {
  return (
    <div id="waitlist" className="text-center">
      <h2 className="font-heading text-4xl leading-[1.04] font-semibold tracking-normal text-balance sm:text-5xl">
        {content.cta.headline}
      </h2>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button
          nativeButton={false}
          render={
            <a href={env.NEXT_PUBLIC_WAITLIST_URL} target="_blank" rel="noopener noreferrer" />
          }
        >
          Join early access
        </Button>
      </div>
    </div>
  );
}

export function ProductPage({ content }: ProductPageProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-7xl">
        <section className="px-5 pb-16 pt-14 sm:px-8 sm:pb-20 sm:pt-20 lg:px-10 lg:pt-24">
          <ProductHero content={content} />
        </section>

        <section className="px-3 pb-20 sm:px-6 lg:px-8">
          <ProductShowcase content={content} />
        </section>

        <section className="border-t border-border/70 px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
          <ProductDetailsSection content={content} />
        </section>

        <section className="border-t border-border/70 px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
          <ProductCta content={content} />
        </section>

        <section className="border-t border-border/70 px-5 py-16 sm:px-8 lg:px-10">
          <MarketingFooter columns={footerColumns} />
        </section>
      </main>
    </div>
  );
}
