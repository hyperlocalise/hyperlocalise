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
import type { ReactNode } from "react";

import { Cancel01Icon, SearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { FormattedMessage, useIntl } from "react-intl";

import { TypographyMuted, TypographyP, TypographySmall } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { LAVENDER_MESH_GRADIENT_SRC } from "./hero-frame-mesh-stage";
import { slackLaunchIntakeIllustrationMessages } from "./slack-launch-intake-illustration.messages";

const EASE_OUT = [0.19, 1, 0.22, 1] as const;
const AGENT_AVATAR = "/images/logo.png";
const USER_AVATAR = "/images/profile/bella.png";
const THREAD_REPLY_COUNT = 3;

const SLACK = {
  aubergine: "#4a154b",
  aubergineDeep: "#350d36",
  link: "#1264a3",
  blue: "#36c5f0",
  green: "#2eb67d",
  yellow: "#ecb22e",
  red: "#e01e5a",
} as const;

function SlackMark({ className }: { className?: string }) {
  return (
    <div className={cn("grid size-4 shrink-0 grid-cols-2 gap-0.5", className)} aria-hidden>
      <span className="rounded-full" style={{ backgroundColor: SLACK.blue }} />
      <span className="rounded-full" style={{ backgroundColor: SLACK.green }} />
      <span className="rounded-full" style={{ backgroundColor: SLACK.yellow }} />
      <span className="rounded-full" style={{ backgroundColor: SLACK.red }} />
    </div>
  );
}

function SlackAvatar({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div className={cn("relative size-9 shrink-0 overflow-hidden rounded-lg bg-muted", className)}>
      <Image src={src} alt={alt} fill sizes="36px" className="object-cover" />
    </div>
  );
}

function AgentBadge() {
  return (
    <span
      className="inline-flex items-center rounded px-1 py-px text-[0.62rem] font-bold tracking-[0.04em] text-white uppercase"
      style={{ backgroundColor: SLACK.aubergine }}
    >
      <FormattedMessage {...slackLaunchIntakeIllustrationMessages.agentBadge} />
    </span>
  );
}

function MessageMeta({ name, isAgent = false }: { name: string; isAgent?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={cn(
          "text-[0.8rem] font-bold",
          isAgent ? "text-[#4a154b] dark:text-[#e8b4f2]" : "text-foreground",
        )}
      >
        {name}
      </span>
      {isAgent ? <AgentBadge /> : null}
      <span className="text-[0.65rem] text-muted-foreground">12:41</span>
    </div>
  );
}

function AgentMention({ name }: { name: string }) {
  return (
    <span className="rounded-[0.2rem] px-0.5 font-medium text-[#1264a3] dark:text-[#1d9bd1]">
      @{name}
    </span>
  );
}

function ChannelMessage({
  avatarSrc,
  avatarAlt,
  name,
  isAgent,
  children,
  className,
}: {
  avatarSrc: string;
  avatarAlt: string;
  name: string;
  isAgent?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-3 px-4 py-2", className)}>
      <SlackAvatar src={avatarSrc} alt={avatarAlt} />
      <div className="min-w-0 flex-1 space-y-1">
        <MessageMeta name={name} isAgent={isAgent} />
        <div className="text-[0.8rem] leading-5 text-foreground/90">{children}</div>
      </div>
    </div>
  );
}

export function SlackLaunchIntakeIllustration({
  className,
  embedded = false,
}: {
  className?: string;
  /** Omit outer mesh chrome when nested in a parent mesh card. */
  embedded?: boolean;
}) {
  const intl = useIntl();
  const shouldReduceMotion = useReducedMotion();
  const agentName = intl.formatMessage(slackLaunchIntakeIllustrationMessages.agentName);
  const userName = intl.formatMessage(slackLaunchIntakeIllustrationMessages.userName);

  const intakeItems = [
    slackLaunchIntakeIllustrationMessages.intakeItemDesign,
    slackLaunchIntakeIllustrationMessages.intakeItemLayers,
    slackLaunchIntakeIllustrationMessages.intakeItemLocales,
    slackLaunchIntakeIllustrationMessages.intakeItemReview,
  ] as const;

  const slackPanel = (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-background shadow-[0_24px_64px_rgba(0,0,0,0.22)] sm:rounded-2xl",
        embedded ? "h-[26rem] sm:h-[28rem]" : "min-h-112 lg:min-h-128",
      )}
    >
      <div
        className={cn(
          "grid",
          embedded
            ? "h-full grid-rows-2 lg:grid-rows-1 lg:grid-cols-[2.75rem_minmax(0,1.1fr)_minmax(14rem,0.95fr)]"
            : "lg:grid-cols-[2.75rem_minmax(0,1.15fr)_minmax(16rem,0.95fr)]",
        )}
      >
        <div
          className="hidden flex-col items-center gap-3 px-2 py-3 lg:flex"
          style={{ backgroundColor: SLACK.aubergineDeep }}
          aria-hidden
        >
          <div
            className="flex size-9 items-center justify-center rounded-xl"
            style={{ backgroundColor: SLACK.aubergine }}
          >
            <SlackMark className="size-4 gap-0.5" />
          </div>
          <div className="mt-1 size-9 rounded-xl bg-white/10 ring-2 ring-white/70" />
          <div className="size-9 rounded-xl bg-white/8" />
        </div>

        <div
          className={cn(
            "flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r",
            !embedded && "min-h-112 lg:min-h-128",
          )}
        >
          <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-4">
            <div
              className="flex size-7 items-center justify-center rounded-md lg:hidden"
              style={{ backgroundColor: SLACK.aubergine }}
              aria-hidden
            >
              <SlackMark className="size-3.5 gap-px" />
            </div>
            <TypographyP className="pb-0 text-[0.8rem] font-bold tracking-[-0.02em] text-foreground">
              <span className="text-[#4a154b] dark:text-[#e8b4f2]">#</span>
              <FormattedMessage {...slackLaunchIntakeIllustrationMessages.channelName} />
            </TypographyP>
            <div className="ms-auto flex items-center gap-2 text-muted-foreground">
              <TypographySmall className="text-[0.72rem] text-muted-foreground">
                <FormattedMessage {...slackLaunchIntakeIllustrationMessages.memberCount} />
              </TypographySmall>
              <HugeiconsIcon icon={SearchIcon} strokeWidth={1.8} className="size-4" />
            </div>
          </header>

          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col py-3",
              embedded ? "overflow-y-auto overscroll-contain" : "justify-end",
            )}
          >
            <ChannelMessage
              avatarSrc={AGENT_AVATAR}
              avatarAlt={agentName}
              name={agentName}
              isAgent
              className="opacity-45"
            >
              <TypographyMuted className="text-[0.8rem] leading-5">
                <FormattedMessage {...slackLaunchIntakeIllustrationMessages.blurMessageOne} />
              </TypographyMuted>
            </ChannelMessage>

            <ChannelMessage
              avatarSrc={USER_AVATAR}
              avatarAlt={userName}
              name={userName}
              className="mt-1"
            >
              <FormattedMessage
                {...slackLaunchIntakeIllustrationMessages.channelPrompt}
                values={{ mention: <AgentMention name={agentName} /> }}
              />
              <button
                type="button"
                tabIndex={-1}
                className="mt-1.5 flex items-center gap-1.5 text-left text-[0.72rem] font-medium"
                style={{ color: SLACK.link }}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: SLACK.link }}
                  aria-hidden
                />
                <FormattedMessage
                  {...slackLaunchIntakeIllustrationMessages.repliesLabel}
                  values={{ count: THREAD_REPLY_COUNT }}
                />
              </button>
            </ChannelMessage>
          </div>

          <div className="shrink-0 border-t border-border p-3">
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
              <FormattedMessage {...slackLaunchIntakeIllustrationMessages.composerPlaceholder} />
            </div>
          </div>
        </div>

        <aside
          className={cn("flex min-h-0 flex-col", !embedded && "min-h-112 lg:min-h-128")}
          style={{ backgroundColor: "color-mix(in srgb, #4a154b 5%, var(--background))" }}
        >
          <header
            className="flex h-12 shrink-0 items-center justify-between border-b px-4"
            style={{
              borderColor: "color-mix(in srgb, #4a154b 16%, var(--border))",
              backgroundColor: "color-mix(in srgb, #4a154b 7%, var(--background))",
            }}
          >
            <TypographyP className="pb-0 text-[0.8rem] font-bold text-[#4a154b] dark:text-[#e8b4f2]">
              <FormattedMessage {...slackLaunchIntakeIllustrationMessages.threadTitle} />
            </TypographyP>
            <button
              type="button"
              tabIndex={-1}
              className="rounded p-1 text-muted-foreground"
              aria-label={intl.formatMessage(slackLaunchIntakeIllustrationMessages.closeThreadAria)}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.8} className="size-4" />
            </button>
          </header>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
            <ChannelMessage
              avatarSrc={USER_AVATAR}
              avatarAlt={userName}
              name={userName}
              className="px-0"
            >
              <FormattedMessage
                {...slackLaunchIntakeIllustrationMessages.channelPrompt}
                values={{ mention: <AgentMention name={agentName} /> }}
              />
            </ChannelMessage>

            <div className="border-t border-border" />

            <ChannelMessage
              avatarSrc={AGENT_AVATAR}
              avatarAlt={agentName}
              name={agentName}
              isAgent
              className="px-0"
            >
              <p>
                <FormattedMessage {...slackLaunchIntakeIllustrationMessages.agentSummaryIntro} />
              </p>
              <ul className="mt-2 space-y-1 text-[0.78rem] leading-5 text-foreground/88">
                {intakeItems.map((item, index) => {
                  const bullet = [SLACK.blue, SLACK.green, SLACK.yellow, SLACK.red][index]!;
                  return (
                    <li key={item.id} className="flex gap-2.5">
                      <span
                        className="mt-2 size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: bullet }}
                        aria-hidden
                      />
                      <span>
                        <FormattedMessage {...item} />
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2.5">
                <FormattedMessage {...slackLaunchIntakeIllustrationMessages.agentSummaryOutro} />
              </p>
            </ChannelMessage>

            <ChannelMessage
              avatarSrc={USER_AVATAR}
              avatarAlt={userName}
              name={userName}
              className="px-0"
            >
              <FormattedMessage {...slackLaunchIntakeIllustrationMessages.userFollowUp} />
            </ChannelMessage>

            <ChannelMessage
              avatarSrc={AGENT_AVATAR}
              avatarAlt={agentName}
              name={agentName}
              isAgent
              className="px-0"
            >
              <FormattedMessage {...slackLaunchIntakeIllustrationMessages.agentConfirmation} />
            </ChannelMessage>
          </div>
        </aside>
      </div>
    </div>
  );

  if (embedded) {
    return <div className={cn("relative", className)}>{slackPanel}</div>;
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1.5rem] border border-border shadow-[0_20px_48px_rgba(0,0,0,0.14)] sm:rounded-[2rem]",
        className,
      )}
    >
      <Image
        src={LAVENDER_MESH_GRADIENT_SRC}
        alt=""
        aria-hidden
        fill
        sizes="(min-width: 1024px) 72rem, 100vw"
        className="pointer-events-none object-cover object-center opacity-90"
      />

      <motion.div
        className="relative p-3 sm:p-5 lg:p-7"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 20, scale: 0.985 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{
          duration: shouldReduceMotion ? 0 : 0.7,
          ease: EASE_OUT,
        }}
      >
        {slackPanel}
      </motion.div>
    </div>
  );
}
