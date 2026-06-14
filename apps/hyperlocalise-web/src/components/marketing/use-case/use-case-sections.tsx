import { ArrowRightIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { TypographyH1, TypographyH2, TypographyH3, TypographyP } from "@/components/ui/typography";
import { env } from "@/lib/env";

import type { UseCasePageContent } from "./use-case-page-content";

type UseCaseHeroProps = {
    content: UseCasePageContent["hero"];
};

export function UseCaseHero({ content }: UseCaseHeroProps) {
    return (
        <section className="pt-16 lg:pt-20">
            <div className="max-w-3xl space-y-8">
                <p className="text-sm font-medium tracking-[0.14em] text-muted-foreground uppercase">
                    {content.eyebrow}
                </p>
                <TypographyH1 className="text-left text-balance">{content.headline}</TypographyH1>
                <TypographyP className="max-w-2xl text-muted-foreground">{content.subheadline}</TypographyP>
                <Button
                    nativeButton={false}
                    render={
                        <a href={env.NEXT_PUBLIC_WAITLIST_URL} target="_blank" rel="noopener noreferrer" />
                    }
                >
                    {content.ctaLabel}
                </Button>
            </div>
        </section>
    );
}

type UseCaseProblemSectionProps = {
    content: UseCasePageContent["problem"];
};

export function UseCaseProblemSection({ content }: UseCaseProblemSectionProps) {
    return (
        <section>
            <div className="max-w-2xl space-y-5">
                <div className="text-sm text-muted-foreground/60">02 The problem</div>
                <TypographyH2 className="text-4xl sm:text-5xl">{content.title}</TypographyH2>
                <TypographyP className="text-muted-foreground">{content.description}</TypographyP>
            </div>

            <ul className="mt-10 grid gap-4 sm:grid-cols-2">
                {content.pains.map((pain, index) => (
                    <li
                        key={pain}
                        className="rounded-[1.25rem] border border-border/70 bg-muted/20 px-5 py-5 text-sm leading-relaxed text-muted-foreground"
                    >
                        <span className="mb-2 block text-xs font-medium tracking-[0.12em] text-muted-foreground/60 uppercase">
                            02.{index + 1}
                        </span>
                        {pain}
                    </li>
                ))}
            </ul>
        </section>
    );
}

type UseCaseWorkflowSectionProps = {
    content: UseCasePageContent["workflow"];
};

export function UseCaseWorkflowSection({ content }: UseCaseWorkflowSectionProps) {
    return (
        <section>
            <div className="max-w-2xl space-y-5">
                <div className="text-sm text-muted-foreground/60">03 {content.label}</div>
                <TypographyH2 className="text-4xl sm:text-5xl">{content.title}</TypographyH2>
                <TypographyP className="text-muted-foreground">{content.description}</TypographyP>
            </div>

            <div className="mt-12 overflow-hidden rounded-[1.5rem] border border-foreground/10 bg-background shadow-[0_20px_48px_rgba(0,0,0,0.14)] sm:rounded-[2rem]">
                <div className="grid divide-y divide-foreground/10 sm:grid-cols-2 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
                    {content.steps.map((step, index) => (
                        <article
                            key={step.label}
                            className="flex flex-col gap-3 px-6 py-7 sm:px-7 sm:py-8"
                        >
                            <TypographyP className="text-[0.95rem] tracking-[-0.02em] text-foreground/40">
                                03.{index + 1}
                            </TypographyP>
                            <TypographyH3 className="text-xl font-medium tracking-[-0.03em] text-foreground">
                                {step.label}
                            </TypographyH3>
                            {step.description ? (
                                <TypographyP className="text-sm leading-relaxed text-foreground/50">
                                    {step.description}
                                </TypographyP>
                            ) : null}
                        </article>
                    ))}
                </div>
            </div>

            <div className="mt-8 hidden items-center gap-2 text-sm text-muted-foreground/60 lg:flex">
                {content.steps.map((step, index) => (
                    <div key={step.label} className="flex items-center gap-2">
                        <span>{step.label}</span>
                        {index < content.steps.length - 1 ? (
                            <HugeiconsIcon icon={ArrowRightIcon} className="size-3.5" strokeWidth={1.7} />
                        ) : null}
                    </div>
                ))}
            </div>
        </section>
    );
}

type UseCaseCapabilitiesSectionProps = {
    content: UseCasePageContent["capabilities"];
};

export function UseCaseCapabilitiesSection({ content }: UseCaseCapabilitiesSectionProps) {
    return (
        <section>
            <div className="max-w-2xl space-y-5">
                <div className="text-sm text-muted-foreground/60">04 {content.label}</div>
                <TypographyH2 className="text-4xl sm:text-5xl">{content.title}</TypographyH2>
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-2">
                {content.items.map((item, index) => (
                    <article
                        key={item.title}
                        className="rounded-[1.25rem] border border-border/70 px-6 py-6"
                    >
                        <div className="text-xs font-medium tracking-[0.12em] text-muted-foreground/60 uppercase">
                            04.{index + 1}
                        </div>
                        <TypographyH3 className="mt-3 text-xl font-medium tracking-[-0.03em]">
                            {item.title}
                        </TypographyH3>
                        <TypographyP className="mt-3 text-sm leading-relaxed text-muted-foreground">
                            {item.description}
                        </TypographyP>
                    </article>
                ))}
            </div>
        </section>
    );
}

type UseCaseDifferentiatorSectionProps = {
    content: UseCasePageContent["differentiator"];
};

export function UseCaseDifferentiatorSection({ content }: UseCaseDifferentiatorSectionProps) {
    return (
        <section>
            <div className="max-w-3xl space-y-5">
                <div className="text-sm text-muted-foreground/60">05 {content.label}</div>
                <TypographyH2 className="text-4xl sm:text-5xl text-balance">{content.title}</TypographyH2>
                <TypographyP className="max-w-2xl text-muted-foreground">{content.description}</TypographyP>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {content.points.map((point, index) => (
                    <div
                        key={point}
                        className="rounded-full border border-border/70 px-4 py-3 text-sm text-muted-foreground"
                    >
                        05.{index + 1} {point}
                    </div>
                ))}
            </div>
        </section>
    );
}

type UseCaseScenarioSectionProps = {
    content: UseCasePageContent["scenario"];
};

export function UseCaseScenarioSection({ content }: UseCaseScenarioSectionProps) {
    return (
        <section>
            <div className="max-w-2xl space-y-5">
                <div className="text-sm text-muted-foreground/60">06 {content.label}</div>
                <TypographyH2 className="text-4xl sm:text-5xl">{content.title}</TypographyH2>
            </div>

            <blockquote className="mt-10 rounded-[1.5rem] border border-foreground/10 bg-muted/25 px-6 py-8 sm:px-8 sm:py-10">
                <TypographyP className="text-lg leading-relaxed text-foreground/80 sm:text-xl sm:leading-8">
                    {content.narrative}
                </TypographyP>
            </blockquote>
        </section>
    );
}

type UseCaseCtaSectionProps = {
    content: UseCasePageContent["cta"];
};

export function UseCaseCtaSection({ content }: UseCaseCtaSectionProps) {
    return (
        <section id="waitlist" className="text-center">
            <TypographyH2 className="pb-0 text-4xl leading-[1.04] font-semibold tracking-[-0.04em] normal-case sm:text-5xl">
                {content.headline}
            </TypographyH2>
            <TypographyP className="mx-auto mt-5 max-w-2xl text-muted-foreground">
                {content.description}
            </TypographyP>
            <div className="mt-8 flex justify-center">
                <Button
                    className="rounded-full px-5"
                    nativeButton={false}
                    render={
                        <a href={env.NEXT_PUBLIC_WAITLIST_URL} target="_blank" rel="noopener noreferrer" />
                    }
                >
                    {content.primaryLabel}
                </Button>
            </div>
        </section>
    );
}
