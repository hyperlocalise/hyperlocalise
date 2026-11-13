"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { Icon } from "@phosphor-icons/react";
import {
  ArrowsSplitIcon,
  ChartLineUpIcon,
  ChatsCircleIcon,
  CheckIcon,
  CodeIcon,
  GitBranchIcon,
  GlobeHemisphereWestIcon,
  KeyIcon,
  LightningIcon,
  MagnifyingGlassIcon,
  PaletteIcon,
  PauseIcon,
  PlayIcon,
  PlugsConnectedIcon,
  ShieldCheckIcon,
  StackIcon,
  TerminalWindowIcon,
  TrayIcon,
  UsersThreeIcon,
  XIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import {
  PRODUCT_PREVIEW_VIDEO_URL,
  getYouTubeVideoId,
} from "@/components/marketing/homepage/product-preview";
import { SectionMeshBackground } from "@/components/marketing/hero-frame-mesh-stage";
import { MarketingConversionCtaButtons } from "@/components/marketing/marketing-conversion-cta-buttons";
import {
  DomainsAuditDashboard,
  type DomainsAuditFocus,
} from "@/components/marketing/product/domains-mock-ui";
import { StyleGuidePanel } from "@/components/marketing/product/guideline-mock-ui";
import { HyperlabExperimentsPanel } from "@/components/marketing/product/hyperlab-mock-ui";
import { IRIS_LAUNCH_YOUTUBE_ID } from "@/lib/iris/iris-waitlist";
import { cn } from "@/lib/primitives/cn";

import { DotGrid, getUseCaseMesh } from "./use-case-backdrops";
import { USE_CASE_INTEGRATIONS } from "./use-case-integrations";
import { AppWindow, UseCaseMockVisualView } from "./use-case-mock-kit";
import type { UseCasePageContent, UseCasePersona } from "./use-case-page-content";
import { useCasePageMessages as shared } from "./use-case-page-content.messages";
import { UseCasePersonaTag } from "./use-case-persona-section";
import type { UseCaseHeroVisual, UseCaseStory } from "./use-case-story-types";

const EASE_OUT = [0.19, 1, 0.22, 1] as const;
const GUIDE_STEP_MS = 6500;
const HERO_CYCLE_MS = 3200;

const ON_MESH_SECONDARY_BUTTON_CLASS =
  "rounded-full border-white/30 bg-white/10 px-5 text-white backdrop-blur-md hover:bg-white/20 hover:text-white dark:border-white/30 dark:bg-white/10 dark:hover:bg-white/20";

const EYEBROW_CLASS = "text-xs font-semibold tracking-[0.16em] text-primary uppercase";
const SECTION_TITLE_CLASS =
  "font-heading text-[clamp(2rem,3.6vw,3.25rem)] leading-[1.06] tracking-[-0.035em] text-balance";

function SectionIntro({
  eyebrow,
  title,
  body,
  align = "start",
}: {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  body?: React.ReactNode;
  align?: "start" | "center";
}) {
  return (
    <div
      className={cn(
        "flex max-w-3xl flex-col gap-4",
        align === "center" && "mx-auto items-center text-center",
      )}
    >
      <p className={EYEBROW_CLASS}>{eyebrow}</p>
      <h2 className={SECTION_TITLE_CLASS}>{title}</h2>
      {body ? (
        <p className="max-w-2xl text-base leading-7 text-pretty text-muted-foreground sm:text-lg">
          {body}
        </p>
      ) : null}
    </div>
  );
}

/** Cycles 0..count-1 while `active`; returns the current index. */
function useCycle(count: number, intervalMs: number, active: boolean) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active || count <= 1) {
      return;
    }
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % count),
      intervalMs,
    );
    return () => window.clearInterval(timer);
  }, [active, count, intervalMs]);
  return index;
}

const DOMAIN_FOCUS_ORDER: DomainsAuditFocus[] = ["localisation", "seo", "aeo"];

function HeroProductVisual({ visual }: { visual: UseCaseHeroVisual }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const reduceMotion = useReducedMotion() ?? false;
  const animate = inView && !reduceMotion;
  const cycle = useCycle(3, HERO_CYCLE_MS, animate);
  const intl = useIntl();

  let content: React.ReactNode;
  switch (visual.kind) {
    case "domains":
      content = (
        <AppWindow>
          <div className="p-3 sm:p-4">
            <DomainsAuditDashboard focus={DOMAIN_FOCUS_ORDER[cycle]} />
          </div>
        </AppWindow>
      );
      break;
    case "hyperlab":
      content = (
        <AppWindow>
          <div className="p-3 sm:p-4">
            <HyperlabExperimentsPanel rolloutPercent={[10, 50, 100][cycle]} />
          </div>
        </AppWindow>
      );
      break;
    case "guidelines":
      content = (
        <AppWindow>
          <div className="p-3 sm:p-4">
            <StyleGuidePanel activeRuleIndex={cycle} />
          </div>
        </AppWindow>
      );
      break;
    case "composition":
      content = (
        <div className="relative">
          <div className="lg:ms-12">
            <UseCaseMockVisualView visual={visual.primary} />
          </div>
          {/* Overlaps the primary window by a fixed amount so neither hides the other's content. */}
          <motion.div
            className="relative z-10 mt-4 sm:w-[80%] lg:-mt-6 lg:w-[62%]"
            initial={reduceMotion ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5, ease: EASE_OUT }}
          >
            <UseCaseMockVisualView visual={visual.floating} />
          </motion.div>
        </div>
      );
      break;
  }

  return (
    <div
      ref={ref}
      role="img"
      aria-label={intl.formatMessage(shared.mockPreviewLabel)}
      className="relative"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.5rem] bg-white/10 blur-2xl"
      />
      <div aria-hidden className="contents">
        {content}
      </div>
    </div>
  );
}

export function UseCaseHero({ page, story }: { page: UseCasePageContent; story: UseCaseStory }) {
  const mesh = getUseCaseMesh(page.slug);
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative isolate -mt-16 overflow-hidden px-5 pb-20 pt-28 sm:px-8 sm:pt-32 lg:px-10 lg:pb-28">
      <SectionMeshBackground src={mesh.hero} priority />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(0,0,0,0.55)_0%,rgba(0,0,0,0.38)_55%,rgba(0,0,0,0.2)_100%)]"
      />
      <DotGrid tone="light" fade="top" />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-10 h-32 bg-gradient-to-b from-transparent to-background"
      />

      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
        <motion.div
          className="flex flex-col gap-6 text-white"
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE_OUT }}
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <UseCasePersonaTag persona={page.persona} />
            <p className="text-xs font-semibold tracking-[0.18em] text-white/75 uppercase">
              <FormattedMessage {...shared[page.labelKey]} />
            </p>
          </div>
          <h1 className="font-heading text-[clamp(2.4rem,4.8vw,4.25rem)] leading-[1.03] tracking-[-0.035em] text-balance">
            <FormattedMessage {...story.hero.headline} />
          </h1>
          <p className="max-w-xl text-base leading-7 text-pretty text-white/80 sm:text-lg sm:leading-8">
            <FormattedMessage {...story.hero.body} />
          </p>
          <MarketingConversionCtaButtons
            className="flex flex-col items-start gap-3 pt-1 sm:flex-row sm:items-center"
            primaryButtonClassName="rounded-full px-5"
            secondaryButtonClassName={ON_MESH_SECONDARY_BUTTON_CLASS}
          />
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 32, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.15, ease: EASE_OUT }}
        >
          <HeroProductVisual visual={story.hero.visual} />
        </motion.div>
      </div>
    </section>
  );
}

export function UseCaseShiftSection({ story }: { story: UseCaseStory }) {
  return (
    <div className="flex flex-col gap-12">
      <SectionIntro
        eyebrow={<FormattedMessage {...shared.shiftSectionLabel} />}
        title={<FormattedMessage {...story.shift.title} />}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-5 rounded-[1.75rem] border border-border bg-muted/40 p-6 sm:p-8">
          <p className="text-sm font-semibold text-muted-foreground">
            <FormattedMessage {...shared.shiftBeforeLabel} />
          </p>
          <ul className="flex flex-col gap-4">
            {story.shift.before.map((item, index) => (
              <li key={index} className="flex gap-3 text-[0.95rem] leading-7 text-muted-foreground">
                <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-300">
                  <XIcon aria-hidden weight="bold" className="size-3" />
                </span>
                <FormattedMessage {...item} />
              </li>
            ))}
          </ul>
        </div>

        <div className="relative isolate flex flex-col gap-5 overflow-hidden rounded-[1.75rem] border border-primary/20 bg-background p-6 shadow-[0_24px_60px_-32px_rgba(37,99,235,0.45)] sm:p-8">
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 -z-10 h-1 bg-gradient-to-r from-primary via-sky-400 to-violet-400"
          />
          <DotGrid fade="radial" className="opacity-60" />
          <p className="text-sm font-semibold text-primary">
            <FormattedMessage {...shared.shiftAfterLabel} />
          </p>
          <ul className="flex flex-col gap-4">
            {story.shift.after.map((item, index) => (
              <li key={index} className="flex gap-3 text-[0.95rem] leading-7 font-medium">
                <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <CheckIcon aria-hidden weight="bold" className="size-3" />
                </span>
                <FormattedMessage {...item} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function UseCaseGuideSection({
  page,
  story,
}: {
  page: UseCasePageContent;
  story: UseCaseStory;
}) {
  const intl = useIntl();
  const reduceMotion = useReducedMotion() ?? false;
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(stageRef, { amount: 0.35 });
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(!reduceMotion);
  const [hovering, setHovering] = useState(false);
  const steps = story.guide.steps;
  const running = playing && inView && !hovering && !reduceMotion;
  const mesh = getUseCaseMesh(page.slug);

  useEffect(() => {
    if (!running) {
      return;
    }
    const timer = window.setTimeout(
      () => setActive((current) => (current + 1) % steps.length),
      GUIDE_STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [running, active, steps.length]);

  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <SectionIntro
          eyebrow={<FormattedMessage {...shared.guideSectionLabel} />}
          title={<FormattedMessage {...story.guide.title} />}
          body={<FormattedMessage {...story.guide.body} />}
        />
        {reduceMotion ? null : (
          <button
            type="button"
            onClick={() => setPlaying((value) => !value)}
            aria-label={intl.formatMessage(playing ? shared.guidePause : shared.guidePlay)}
            className="flex size-10 shrink-0 items-center justify-center self-start rounded-full border border-border bg-background text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:self-end"
          >
            {playing ? (
              <PauseIcon aria-hidden weight="fill" className="size-4" />
            ) : (
              <PlayIcon aria-hidden weight="fill" className="size-4" />
            )}
          </button>
        )}
      </div>

      <div
        ref={stageRef}
        className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-10"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <ol className="flex flex-col gap-2" role="tablist" aria-orientation="vertical">
          {steps.map((step, index) => {
            const isActive = index === active;
            return (
              <li key={index} role="presentation">
                <button
                  type="button"
                  role="tab"
                  id={`guide-tab-${index}`}
                  aria-selected={isActive}
                  aria-controls="guide-panel"
                  onClick={() => setActive(index)}
                  className={cn(
                    "group relative flex w-full gap-4 overflow-hidden rounded-2xl border p-4 text-start transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-5",
                    isActive
                      ? "border-border bg-background shadow-[0_16px_40px_-24px_rgba(0,0,0,0.35)]"
                      : "border-transparent hover:bg-muted/60",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="flex min-w-0 flex-col gap-1.5">
                    <span className="sr-only">
                      <FormattedMessage {...shared.guideStepLabel} values={{ number: index + 1 }} />
                    </span>
                    <span
                      className={cn(
                        "text-base font-semibold tracking-[-0.02em]",
                        !isActive && "text-foreground/75",
                      )}
                    >
                      <FormattedMessage {...step.title} />
                    </span>
                    <span
                      className={cn(
                        "grid text-sm leading-6 text-muted-foreground transition-[grid-template-rows,opacity] duration-500",
                        isActive
                          ? "grid-rows-[1fr] opacity-100"
                          : "grid-rows-[0fr] opacity-0 lg:grid-rows-[0fr]",
                      )}
                    >
                      <span className="overflow-hidden">
                        <FormattedMessage {...step.body} />
                      </span>
                    </span>
                  </span>
                  {isActive && running ? (
                    <motion.span
                      key={`progress-${active}`}
                      aria-hidden
                      className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: GUIDE_STEP_MS / 1000, ease: "linear" }}
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>

        <div
          id="guide-panel"
          role="tabpanel"
          aria-labelledby={`guide-tab-${active}`}
          className="relative isolate flex min-h-[26rem] items-center overflow-hidden rounded-[1.75rem] p-4 sm:p-8 lg:min-h-[32rem] lg:p-10"
        >
          <SectionMeshBackground src={mesh.accent} />
          <div aria-hidden className="absolute inset-0 -z-10 bg-black/10" />
          <DotGrid tone="light" fade="radial" />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active}
              className="w-full"
              initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.45, ease: EASE_OUT }}
            >
              <UseCaseMockVisualView visual={steps[active].visual} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/** Campaign pages show Iris, which localises video creative; every other page shows the platform walkthrough. */
function getUseCaseVideo(slug: string) {
  if (slug === "marketing-localisation") {
    return { id: IRIS_LAUNCH_YOUTUBE_ID, title: shared.videoIrisTitle, body: shared.videoIrisBody };
  }
  return {
    id: getYouTubeVideoId(PRODUCT_PREVIEW_VIDEO_URL),
    title: shared.videoSectionTitle,
    body: shared.videoSectionBody,
  };
}

export function UseCaseVideoSection({ slug }: { slug: string }) {
  const intl = useIntl();
  const [playing, setPlaying] = useState(false);
  const video = getUseCaseVideo(slug);
  const videoId = video.id;
  const mesh = getUseCaseMesh(slug);

  if (!videoId) {
    return null;
  }

  return (
    <div className="flex flex-col gap-10">
      <SectionIntro
        align="center"
        eyebrow={<FormattedMessage {...shared.videoSectionLabel} />}
        title={<FormattedMessage {...video.title} />}
        body={<FormattedMessage {...video.body} />}
      />
      <div className="relative isolate mx-auto w-full max-w-5xl overflow-hidden rounded-[1.75rem] p-2 shadow-[0_40px_100px_-40px_rgba(0,0,0,0.55)] sm:p-3">
        <SectionMeshBackground src={mesh.hero} />
        <div className="relative aspect-video overflow-hidden rounded-[1.25rem] bg-black">
          {playing ? (
            <iframe
              className="absolute inset-0 size-full"
              src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
              title={intl.formatMessage(shared.videoFrameTitle)}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              aria-label={intl.formatMessage(shared.videoPlay)}
              className="group absolute inset-0 flex items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white"
            >
              <Image
                src={`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`}
                alt=""
                fill
                unoptimized
                sizes="(min-width: 1024px) 64rem, 100vw"
                className="object-cover opacity-80 transition-[opacity,transform] duration-700 group-hover:scale-[1.02] group-hover:opacity-90"
              />
              <span
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent"
              />
              <span className="relative flex size-20 items-center justify-center rounded-full bg-white/90 text-neutral-900 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.5)] backdrop-blur transition-transform duration-300 group-hover:scale-105 sm:size-24">
                <PlayIcon aria-hidden weight="fill" className="ms-1 size-8" />
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function UseCaseIntegrationsRow({ story }: { story: UseCaseStory }) {
  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <div className="flex flex-col items-center gap-3">
        <p className={EYEBROW_CLASS}>
          <FormattedMessage {...shared.integrationsSectionLabel} />
        </p>
        <h2 className="max-w-2xl text-2xl font-semibold tracking-[-0.03em] text-balance sm:text-3xl">
          <FormattedMessage {...story.integrations.title} />
        </h2>
      </div>
      <ul className="flex max-w-4xl flex-wrap justify-center gap-3">
        {story.integrations.ids.map((id) => {
          const integration = USE_CASE_INTEGRATIONS[id];
          return (
            <li
              key={id}
              className="flex items-center gap-2.5 rounded-full border border-border bg-background/80 py-2 ps-2.5 pe-4 text-sm font-medium shadow-[0_1px_0_rgba(0,0,0,0.03)] backdrop-blur"
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-muted/70">
                <Image
                  src={integration.logo}
                  alt=""
                  width={18}
                  height={18}
                  className={cn(
                    "size-[18px] object-contain",
                    "invertInDark" in integration && integration.invertInDark && "dark:invert",
                  )}
                />
              </span>
              {integration.name}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const CAPABILITY_ICONS: Record<UseCasePersona, Icon[]> = {
  "localisation-manager": [
    TrayIcon,
    ArrowsSplitIcon,
    UsersThreeIcon,
    StackIcon,
    PlugsConnectedIcon,
    ChartLineUpIcon,
  ],
  "international-growth": [
    MagnifyingGlassIcon,
    GlobeHemisphereWestIcon,
    PaletteIcon,
    ShieldCheckIcon,
    UsersThreeIcon,
    ChartLineUpIcon,
  ],
  developer: [GitBranchIcon, CodeIcon, TerminalWindowIcon, ShieldCheckIcon, KeyIcon, LightningIcon],
};

export function UseCaseCapabilitiesSection({
  page,
  story,
}: {
  page: UseCasePageContent;
  story: UseCaseStory;
}) {
  const icons = CAPABILITY_ICONS[page.persona];
  const mesh = getUseCaseMesh(page.slug);
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex flex-col gap-12">
      <SectionIntro
        eyebrow={<FormattedMessage {...shared.capabilitiesSectionLabel} />}
        title={<FormattedMessage {...story.capabilities.title} />}
      />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {story.capabilities.items.map((item, index) => {
          const ItemIcon = icons[index % icons.length] ?? ChatsCircleIcon;
          return (
            <motion.li
              key={index}
              className="group relative isolate flex flex-col gap-4 overflow-hidden rounded-[1.5rem] border border-border bg-background p-6 transition-shadow duration-300 hover:shadow-[0_24px_60px_-32px_rgba(0,0,0,0.35)]"
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.6, delay: (index % 3) * 0.08, ease: EASE_OUT }}
            >
              <DotGrid
                fade="radial"
                className="opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              />
              <span className="relative isolate flex size-11 items-center justify-center overflow-hidden rounded-xl text-white shadow-[0_8px_20px_-8px_rgba(0,0,0,0.4)]">
                <Image
                  src={mesh.hero}
                  alt=""
                  fill
                  unoptimized
                  sizes="44px"
                  className="-z-10 object-cover"
                />
                <span aria-hidden className="absolute inset-0 -z-10 bg-black/25" />
                <ItemIcon aria-hidden weight="duotone" className="size-5" />
              </span>
              <h3 className="text-lg font-semibold tracking-[-0.02em]">
                <FormattedMessage {...item.title} />
              </h3>
              <p className="text-sm leading-6 text-muted-foreground">
                <FormattedMessage {...item.body} />
              </p>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

export function UseCaseScenarioSection({ story }: { story: UseCaseStory }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
      <div className="lg:sticky lg:top-28 lg:self-start">
        <SectionIntro
          eyebrow={<FormattedMessage {...shared.scenarioSectionLabel} />}
          title={<FormattedMessage {...story.scenario.title} />}
          body={<FormattedMessage {...story.scenario.body} />}
        />
      </div>
      <ol className="relative flex flex-col gap-4 ps-8 before:absolute before:inset-y-3 before:start-[0.6875rem] before:w-px before:bg-gradient-to-b before:from-primary/60 before:via-border before:to-transparent">
        {story.scenario.events.map((event, index) => (
          <motion.li
            key={index}
            className="relative"
            initial={reduceMotion ? false : { opacity: 0, x: 12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.6, delay: index * 0.06, ease: EASE_OUT }}
          >
            <span
              aria-hidden
              className="absolute -start-8 top-5 flex size-[1.375rem] items-center justify-center rounded-full border-4 border-background bg-primary"
            />
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-background p-5 sm:p-6">
              <span className="w-fit rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary tabular-nums">
                <FormattedMessage {...event.time} />
              </span>
              <h3 className="text-lg font-semibold tracking-[-0.02em]">
                <FormattedMessage {...event.title} />
              </h3>
              <p className="text-sm leading-6 text-muted-foreground">
                <FormattedMessage {...event.body} />
              </p>
            </div>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

export function UseCaseCtaSection({ slug, story }: { slug: string; story: UseCaseStory }) {
  const mesh = getUseCaseMesh(slug);

  return (
    <section className="relative isolate overflow-hidden rounded-[1.75rem] px-6 py-20 text-center text-white shadow-[0_32px_80px_-28px_rgba(0,0,0,0.5)] sm:rounded-[2.25rem] sm:px-10 sm:py-24">
      <SectionMeshBackground src={mesh.accent} />
      <div aria-hidden className="absolute inset-0 -z-10 bg-black/35" />
      <DotGrid tone="light" fade="radial" />

      <h2 className="mx-auto max-w-3xl font-heading text-4xl leading-[1.04] tracking-[-0.04em] text-balance sm:text-5xl">
        <FormattedMessage {...story.cta.headline} />
      </h2>
      <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-pretty text-white/80 sm:text-lg">
        <FormattedMessage {...story.cta.body} />
      </p>
      <MarketingConversionCtaButtons
        className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
        primaryButtonClassName="rounded-full px-5"
        secondaryButtonClassName={ON_MESH_SECONDARY_BUTTON_CLASS}
      />
    </section>
  );
}
