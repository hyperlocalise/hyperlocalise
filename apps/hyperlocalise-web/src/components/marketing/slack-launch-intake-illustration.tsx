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
import { useEffect, useRef, useState } from "react";

import {
  Cancel01Icon,
  Home06Icon,
  BubbleChatIcon,
  RefreshIcon,
  SearchIcon,
  SentIcon,
  Notification01Icon,
  File01Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { FormattedMessage, useIntl } from "react-intl";

import { TypographyMuted, TypographyP, TypographySmall } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { LAVENDER_MESH_GRADIENT_SRC } from "./hero-frame-mesh-stage";
import { CONVO_STEPS } from "./slack-launch-intake-illustration.data";
import { slackLaunchIntakeIllustrationMessages } from "./slack-launch-intake-illustration.messages";

const EASE_OUT = [0.19, 1, 0.22, 1] as const;
const TYPING_DELAY_MS = 1500;
const AGENT_AVATAR = "/images/logo.png";
const USER_AVATAR = "/images/profile/bella.png";

const SLACK = {
  aubergine: "#4a154b",
  aubergineDeep: "#350d36",
  link: "#1264a3",
  blue: "#36c5f0",
  green: "#2eb67d",
  yellow: "#ecb22e",
  red: "#e01e5a",
} as const;

type Phase = "idle" | "typing-1" | "replied-1" | "typing-2" | "replied-2";

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
    <div className={cn("flex gap-3 py-2", className)}>
      <SlackAvatar src={avatarSrc} alt={avatarAlt} />
      <div className="min-w-0 flex-1 space-y-1">
        <MessageMeta name={name} isAgent={isAgent} />
        <div className="text-[0.8rem] leading-5 text-foreground/90">{children}</div>
      </div>
    </div>
  );
}

function TypingIndicator({ agentName }: { agentName: string }) {
  return (
    <div className="flex gap-3 py-2">
      <SlackAvatar src={AGENT_AVATAR} alt={agentName} />
      <div className="min-w-0 flex-1 pt-2">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="size-1.5 rounded-full bg-muted-foreground"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function RepliesLink({ count, onClick }: { count: number; onClick: () => void }) {
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1.5 flex items-center gap-1.5 text-left text-[0.72rem] font-medium transition-opacity hover:opacity-80"
      style={{ color: SLACK.link }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: SLACK.link }} aria-hidden />
      {count} {count === 1 ? "reply" : "replies"}
    </button>
  );
}

function ThreadComposer({
  phase,
  onFollowUp,
  isDone,
  onReset,
  followUpPrompt,
}: {
  phase: Phase;
  onFollowUp: () => void;
  isDone: boolean;
  onReset: () => void;
  followUpPrompt: string;
}) {
  return (
    <div
      className="shrink-0 border-t border-border p-3"
      style={{ borderColor: "color-mix(in srgb, #4a154b 16%, var(--border))" }}
    >
      {isDone && (
        <div className="flex justify-center pb-1 lg:hidden">
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.72rem] text-muted-foreground transition-colors hover:bg-muted/40"
          >
            <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} className="size-3.5" />
            Replay
          </button>
        </div>
      )}
      {phase === "replied-1" ? (
        <button
          type="button"
          onClick={onFollowUp}
          className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-left text-[0.75rem] text-foreground transition-colors hover:bg-muted/60"
        >
          <span className="flex-1">{followUpPrompt}</span>
          <HugeiconsIcon
            icon={SentIcon}
            strokeWidth={1.8}
            className="size-4 shrink-0 opacity-50 text-muted-foreground"
          />
        </button>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
          <span className="flex-1">Reply in thread...</span>
          <HugeiconsIcon icon={SentIcon} strokeWidth={1.8} className="size-4 shrink-0 opacity-50" />
        </div>
      )}
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
  const initialPrompt = intl.formatMessage(slackLaunchIntakeIllustrationMessages.channelPrompt, {
    mention: `@${agentName}`,
  });
  const mayaFollowUp = intl.formatMessage(slackLaunchIntakeIllustrationMessages.userFollowUp);
  const threadRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [threadOpen, setThreadOpen] = useState(false);

  const replyCount =
    phase === "idle"
      ? 0
      : phase === "typing-1"
        ? 0
        : phase === "replied-1"
          ? 1
          : phase === "typing-2"
            ? 2
            : 3;

  const showMayaInChannel = phase !== "idle";
  const isDone = phase === "replied-2";

  const schedule = (fn: () => void, delay: number) => {
    timerRef.current = setTimeout(fn, shouldReduceMotion ? 0 : delay);
  };

  const handleInitialPrompt = () => {
    setThreadOpen(true);
    setPhase("typing-1");
    schedule(() => setPhase("replied-1"), TYPING_DELAY_MS);
  };

  const handleFollowUpPrompt = () => {
    setPhase("typing-2");
    schedule(() => setPhase("replied-2"), TYPING_DELAY_MS);
  };

  const handleReset = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPhase("idle");
    setThreadOpen(false);
  };

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (threadRef.current && threadOpen) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [phase, threadOpen]);

  const step1 = CONVO_STEPS[0]!;
  const step2 = CONVO_STEPS[1]!;

  const channelPanel = (
    <div
      className={cn(
        "flex min-h-0 flex-col border-r border-border",
        threadOpen ? "hidden lg:flex" : "flex",
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

      <div className="flex min-h-0 flex-1 flex-col justify-end overflow-y-auto overscroll-contain px-4 py-3">
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

        <AnimatePresence>
          {showMayaInChannel && (
            <motion.div
              key="maya-message"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
            >
              <ChannelMessage
                avatarSrc={USER_AVATAR}
                avatarAlt={userName}
                name={userName}
                className="mt-1"
              >
                Hey <AgentMention name={agentName} /> can we localize the Canva spring campaign
                board for FR, DE, and JA by Friday?
                <RepliesLink count={replyCount} onClick={() => setThreadOpen(true)} />
              </ChannelMessage>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="shrink-0 border-t border-border p-3">
        {phase === "idle" ? (
          <button
            type="button"
            onClick={handleInitialPrompt}
            className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-left text-[0.75rem] text-foreground transition-colors hover:bg-muted/60"
          >
            <span className="flex-1">{initialPrompt}</span>
            <HugeiconsIcon
              icon={SentIcon}
              strokeWidth={1.8}
              className="size-4 shrink-0 opacity-50 text-muted-foreground"
            />
          </button>
        ) : (
          <div className="space-y-2">
            {isDone && (
              <div className="flex justify-center pb-1">
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.72rem] text-muted-foreground transition-colors hover:bg-muted/40"
                >
                  <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} className="size-3.5" />
                  Replay
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
              <span className="flex-1">
                <FormattedMessage {...slackLaunchIntakeIllustrationMessages.composerPlaceholder} />
              </span>
              <HugeiconsIcon
                icon={SentIcon}
                strokeWidth={1.8}
                className="size-4 shrink-0 opacity-50"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const threadPanel = (
    <AnimatePresence>
      {threadOpen && (
        <motion.aside
          key="thread"
          initial={shouldReduceMotion ? false : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.28, ease: EASE_OUT }}
          className="col-span-full flex min-h-0 flex-col lg:col-auto"
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
              onClick={() => setThreadOpen(false)}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted/40"
              aria-label={intl.formatMessage(slackLaunchIntakeIllustrationMessages.closeThreadAria)}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.8} className="size-4" />
            </button>
          </header>

          <div
            ref={threadRef}
            className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-4"
          >
            <ChannelMessage avatarSrc={USER_AVATAR} avatarAlt={userName} name={userName}>
              Hey <AgentMention name={agentName} /> can we localize the Canva spring campaign board
              for FR, DE, and JA by Friday?
            </ChannelMessage>

            <div className="flex items-center gap-2 py-1">
              <span className="text-[0.65rem] font-medium text-muted-foreground">
                {replyCount} {replyCount === 1 ? "reply" : "replies"}
              </span>
              <div className="flex-1 border-t border-border" />
            </div>

            <AnimatePresence mode="wait">
              {phase === "typing-1" && (
                <motion.div
                  key="typing-1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <TypingIndicator agentName={agentName} />
                </motion.div>
              )}
              {(phase === "replied-1" || phase === "typing-2" || phase === "replied-2") && (
                <motion.div
                  key="agent-reply-1"
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: EASE_OUT }}
                >
                  <ChannelMessage
                    avatarSrc={AGENT_AVATAR}
                    avatarAlt={agentName}
                    name={agentName}
                    isAgent
                  >
                    {step1.agentReply}
                  </ChannelMessage>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {(phase === "typing-2" || phase === "replied-2") && (
                <motion.div
                  key="maya-followup"
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: EASE_OUT }}
                >
                  <ChannelMessage avatarSrc={USER_AVATAR} avatarAlt={userName} name={userName}>
                    {mayaFollowUp}
                  </ChannelMessage>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
              {phase === "typing-2" && (
                <motion.div
                  key="typing-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <TypingIndicator agentName={agentName} />
                </motion.div>
              )}
              {phase === "replied-2" && (
                <motion.div
                  key="agent-reply-2"
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: EASE_OUT }}
                >
                  <ChannelMessage
                    avatarSrc={AGENT_AVATAR}
                    avatarAlt={agentName}
                    name={agentName}
                    isAgent
                  >
                    {step2.agentReply}
                  </ChannelMessage>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <ThreadComposer
            phase={phase}
            onFollowUp={handleFollowUpPrompt}
            isDone={isDone}
            onReset={handleReset}
            followUpPrompt={mayaFollowUp}
          />
        </motion.aside>
      )}
    </AnimatePresence>
  );

  const slackPanel = (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-background shadow-[0_24px_64px_rgba(0,0,0,0.22)] sm:rounded-2xl",
        embedded ? "h-[26rem] sm:h-[28rem]" : "min-h-112 lg:min-h-128",
      )}
    >
      <div
        className={cn(
          "grid h-full overflow-hidden",
          threadOpen
            ? "lg:grid-cols-[2.75rem_minmax(0,1.1fr)_minmax(14rem,0.95fr)]"
            : "lg:grid-cols-[2.75rem_minmax(0,1fr)]",
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
          <div className="mt-1 flex size-9 items-center justify-center rounded-xl bg-white/10 ring-2 ring-white/70">
            <HugeiconsIcon icon={Home06Icon} strokeWidth={1.8} className="size-5 text-white" />
          </div>
          <div className="flex size-9 items-center justify-center rounded-xl bg-white/8">
            <HugeiconsIcon
              icon={BubbleChatIcon}
              strokeWidth={1.8}
              className="size-5 text-white/60"
            />
          </div>
          <div className="flex size-9 items-center justify-center rounded-xl bg-white/8">
            <HugeiconsIcon
              icon={Notification01Icon}
              strokeWidth={1.8}
              className="size-5 text-white/60"
            />
          </div>
          <div className="flex size-9 items-center justify-center rounded-xl bg-white/8">
            <HugeiconsIcon icon={File01Icon} strokeWidth={1.8} className="size-5 text-white/60" />
          </div>
          <div className="flex size-9 items-center justify-center rounded-xl bg-white/8">
            <HugeiconsIcon
              icon={MoreHorizontalIcon}
              strokeWidth={1.8}
              className="size-5 text-white/60"
            />
          </div>
        </div>

        {channelPanel}
        {threadPanel}
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
