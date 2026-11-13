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
import { useMemo } from "react";
import {
  CheckCircleIcon,
  CircleNotchIcon,
  ClockIcon,
  GitPullRequestIcon,
  SparkleIcon,
  UserIcon,
  WarningCircleIcon,
  WrenchIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { FormattedMessage, useIntl } from "react-intl";

import { cn } from "@/lib/primitives/cn";

import { useCasePageMessages as sharedMessages } from "./use-case-page-content.messages";
import type { MockStatus, UseCaseMockVisual } from "./use-case-story-types";

const EASE_OUT = [0.19, 1, 0.22, 1] as const;

const STATUS_STYLES: Record<
  MockStatus,
  { chip: string; icon: typeof CheckCircleIcon; bar: string }
> = {
  done: {
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    icon: CheckCircleIcon,
    bar: "bg-emerald-500",
  },
  running: {
    chip: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    icon: CircleNotchIcon,
    bar: "bg-sky-500",
  },
  warn: {
    chip: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
    icon: WarningCircleIcon,
    bar: "bg-amber-500",
  },
  error: {
    chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
    icon: XCircleIcon,
    bar: "bg-rose-500",
  },
  todo: {
    chip: "bg-muted text-muted-foreground",
    icon: ClockIcon,
    bar: "bg-muted-foreground/40",
  },
};

const STATUS_LABELS = {
  done: sharedMessages.mockStatusDone,
  running: sharedMessages.mockStatusRunning,
  warn: sharedMessages.mockStatusWarn,
  error: sharedMessages.mockStatusError,
  todo: sharedMessages.mockStatusTodo,
} as const;

export function StatusChip({ status, compact = false }: { status: MockStatus; compact?: boolean }) {
  const style = STATUS_STYLES[status];
  const StatusIcon = style.icon;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-medium",
        style.chip,
      )}
    >
      <StatusIcon
        aria-hidden
        weight="bold"
        className={cn("size-3", status === "running" && "animate-spin motion-reduce:animate-none")}
      />
      {compact ? null : <FormattedMessage {...STATUS_LABELS[status]} />}
    </span>
  );
}

/** Staggered entrance shared by every mock row. Rows re-animate when the visual changes. */
function useRowMotion() {
  const reduceMotion = useReducedMotion();

  return (index: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.45, delay: 0.08 + index * 0.09, ease: EASE_OUT },
        };
}

function useLocaleName() {
  const intl = useIntl();

  return useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([intl.locale], { type: "language" });
    } catch {
      names = null;
    }
    return (code: string) => {
      try {
        return names?.of(code) ?? code;
      } catch {
        return code;
      }
    };
  }, [intl.locale]);
}

/** Window chrome around every mock. `tone="dark"` is for terminals. */
export function MockWindow({
  title,
  icon,
  tone = "light",
  className,
  children,
}: {
  title: ReactNode;
  icon?: ReactNode;
  tone?: "light" | "dark";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border shadow-[0_24px_60px_-28px_rgba(0,0,0,0.45)]",
        tone === "dark"
          ? "border-white/10 bg-[#0d0f14] text-neutral-100"
          : "border-black/[0.07] bg-background/95 text-foreground backdrop-blur-xl dark:border-white/10",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 border-b px-4 py-2.5",
          tone === "dark" ? "border-white/10" : "border-border/80 bg-muted/40",
        )}
      >
        <span aria-hidden className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span
          className={cn(
            "flex min-w-0 items-center gap-1.5 truncate text-xs font-medium",
            tone === "dark" ? "font-mono text-neutral-400" : "text-muted-foreground",
          )}
        >
          {icon}
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

/** Window titled with the Hyperlocalise logomark, used for in-product panels. */
export function AppWindow({ children }: { children: ReactNode }) {
  return (
    <MockWindow
      title={<FormattedMessage {...sharedMessages.mockAgentName} />}
      icon={
        <>
          <Image
            src="/images/logo/logomark-light-mode.svg"
            alt=""
            width={14}
            height={14}
            className="size-3.5 dark:hidden"
          />
          <Image
            src="/images/logo/logomark-dark-mode.svg"
            alt=""
            width={14}
            height={14}
            className="hidden size-3.5 dark:block"
          />
        </>
      }
    >
      {children}
    </MockWindow>
  );
}

function PanelHeading({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-sm font-semibold tracking-[-0.01em]">{title}</p>
      {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

const CHAT_CLIENTS = {
  claude: { name: "Claude Code", logo: "/images/model-providers/anthropic.svg", invert: true },
  codex: { name: "Codex", logo: "/images/model-providers/openai.svg", invert: true },
  cursor: { name: "Cursor", logo: null, invert: false },
  slack: { name: "Slack", logo: "/images/slack-logo.svg", invert: false },
} as const;

function ClientIcon({ client }: { client: keyof typeof CHAT_CLIENTS }) {
  const definition = CHAT_CLIENTS[client];
  if (!definition.logo) {
    return (
      <span
        aria-hidden
        className="flex size-4 items-center justify-center rounded-[4px] bg-foreground text-[0.55rem] font-bold text-background"
      >
        C
      </span>
    );
  }
  return (
    <Image
      src={definition.logo}
      alt=""
      width={14}
      height={14}
      className={cn("size-3.5 object-contain", definition.invert && "dark:invert")}
    />
  );
}

function ChatMock({ visual }: { visual: Extract<UseCaseMockVisual, { kind: "chat" }> }) {
  const rowMotion = useRowMotion();
  const agentFirst = visual.messages.findIndex((message) => message.from === "agent");

  return (
    <MockWindow
      title={<FormattedMessage {...visual.title} />}
      icon={<ClientIcon client={visual.client} />}
    >
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        {visual.messages.map((message, index) => {
          const isAgent = message.from === "agent";
          const showTools =
            isAgent && index === agentFirst && visual.tools && visual.tools.length > 0;

          return (
            <motion.div key={index} {...rowMotion(index * 2)} className="flex flex-col gap-2">
              {showTools ? (
                <div className="flex flex-col gap-1.5 rounded-xl border border-dashed border-border bg-muted/40 p-2.5">
                  {visual.tools?.map((tool) => (
                    <div key={tool.name} className="flex items-center gap-2 text-xs">
                      <WrenchIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                      <code className="font-mono text-[0.7rem] font-medium">{tool.name}</code>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        <FormattedMessage {...tool.detail} />
                      </span>
                      <StatusChip status={tool.status} compact />
                    </div>
                  ))}
                </div>
              ) : null}
              <div
                className={cn(
                  "flex gap-2.5",
                  isAgent ? "items-start" : "flex-row-reverse items-start",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-[0.6rem] font-semibold",
                    isAgent
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {isAgent ? (
                    <SparkleIcon weight="fill" className="size-3.5" />
                  ) : (
                    <UserIcon weight="bold" className="size-3.5" />
                  )}
                </span>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[0.82rem] leading-relaxed",
                    isAgent
                      ? "rounded-tl-md border border-border bg-background"
                      : "rounded-tr-md bg-primary/10 text-foreground",
                  )}
                >
                  {isAgent ? (
                    <p className="mb-0.5 text-[0.68rem] font-semibold text-primary">
                      <FormattedMessage {...sharedMessages.mockAgentName} />
                    </p>
                  ) : null}
                  <FormattedMessage {...message.text} />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </MockWindow>
  );
}

const TERMINAL_LINE_STYLES = {
  cmd: "text-neutral-100",
  out: "text-neutral-300",
  ok: "text-emerald-400",
  warn: "text-amber-300",
  dim: "text-neutral-500",
} as const;

function TerminalMock({ visual }: { visual: Extract<UseCaseMockVisual, { kind: "terminal" }> }) {
  const rowMotion = useRowMotion();

  return (
    <MockWindow title={visual.title} tone="dark">
      <pre className="overflow-x-auto p-4 font-mono text-[0.74rem] leading-6 sm:p-5 sm:text-[0.78rem]">
        {visual.lines.map((line, index) => (
          <motion.span
            key={index}
            {...rowMotion(index)}
            className={cn("block whitespace-pre", TERMINAL_LINE_STYLES[line.kind])}
          >
            {line.kind === "cmd" ? <span className="me-2 select-none text-sky-400">$</span> : null}
            {line.text}
          </motion.span>
        ))}
        <span
          aria-hidden
          className="mt-1 inline-block h-4 w-2 animate-pulse bg-neutral-400/80 motion-reduce:animate-none"
        />
      </pre>
    </MockWindow>
  );
}

function ChecklistMock({ visual }: { visual: Extract<UseCaseMockVisual, { kind: "checklist" }> }) {
  const rowMotion = useRowMotion();

  return (
    <AppWindow>
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <PanelHeading
          title={<FormattedMessage {...visual.title} />}
          subtitle={visual.subtitle ? <FormattedMessage {...visual.subtitle} /> : undefined}
        />
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
          {visual.items.map((item, index) => (
            <motion.li
              key={index}
              {...rowMotion(index)}
              className="flex items-center gap-3 bg-background px-3.5 py-3"
            >
              <span
                className={cn("size-2 shrink-0 rounded-full", STATUS_STYLES[item.status].bar)}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.82rem] font-medium">
                  <FormattedMessage {...item.label} />
                </p>
                {item.meta ? (
                  <p className="truncate text-[0.72rem] text-muted-foreground">
                    <FormattedMessage {...item.meta} />
                  </p>
                ) : null}
              </div>
              <StatusChip status={item.status} />
            </motion.li>
          ))}
        </ul>
      </div>
    </AppWindow>
  );
}

function LocalesMock({ visual }: { visual: Extract<UseCaseMockVisual, { kind: "locales" }> }) {
  const rowMotion = useRowMotion();
  const localeName = useLocaleName();
  const reduceMotion = useReducedMotion();

  return (
    <AppWindow>
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <PanelHeading
          title={<FormattedMessage {...visual.title} />}
          subtitle={visual.subtitle ? <FormattedMessage {...visual.subtitle} /> : undefined}
        />
        <ul className="grid gap-2 sm:grid-cols-2">
          {visual.locales.map((locale, index) => (
            <motion.li
              key={`${locale.code}-${index}`}
              {...rowMotion(index)}
              className="flex flex-col gap-2 rounded-xl border border-border bg-background px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.65rem] font-semibold text-muted-foreground">
                    {locale.code}
                  </code>
                  <span className="truncate text-[0.78rem] font-medium">
                    {localeName(locale.code)}
                  </span>
                </span>
                <StatusChip status={locale.status} compact />
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className={cn("h-full rounded-full", STATUS_STYLES[locale.status].bar)}
                  initial={reduceMotion ? false : { width: 0 }}
                  animate={{ width: `${locale.progress}%` }}
                  transition={{ duration: 0.9, delay: 0.15 + index * 0.08, ease: EASE_OUT }}
                />
              </div>
              <div className="flex items-center justify-between text-[0.68rem] text-muted-foreground">
                <span className="truncate">
                  {locale.note ? <FormattedMessage {...locale.note} /> : null}
                </span>
                <span className="tabular-nums">{locale.progress}%</span>
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </AppWindow>
  );
}

function StringsMock({ visual }: { visual: Extract<UseCaseMockVisual, { kind: "strings" }> }) {
  const rowMotion = useRowMotion();

  return (
    <AppWindow>
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <PanelHeading
          title={<FormattedMessage {...visual.title} />}
          subtitle={visual.subtitle ? <FormattedMessage {...visual.subtitle} /> : undefined}
        />
        <ul className="flex flex-col gap-2">
          {visual.rows.map((row, index) => (
            <motion.li
              key={row.key}
              {...rowMotion(index)}
              className={cn(
                "flex flex-col gap-2 rounded-xl border bg-background p-3",
                row.status === "error"
                  ? "border-rose-500/30"
                  : row.status === "warn"
                    ? "border-amber-500/30"
                    : "border-border",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <code className="truncate font-mono text-[0.68rem] text-muted-foreground">
                  {row.key}
                </code>
                <StatusChip status={row.status} />
              </div>
              <div className="grid gap-1.5 text-[0.8rem] sm:grid-cols-2 sm:gap-3">
                <p className="text-muted-foreground" lang="en">
                  {row.source}
                </p>
                <p className="font-medium" lang={row.locale}>
                  {row.target}
                </p>
              </div>
              {row.note ? (
                <p
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-[0.7rem]",
                    row.status === "error"
                      ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                      : row.status === "warn"
                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  <FormattedMessage {...row.note} />
                </p>
              ) : null}
            </motion.li>
          ))}
        </ul>
      </div>
    </AppWindow>
  );
}

function PullRequestMock({
  visual,
}: {
  visual: Extract<UseCaseMockVisual, { kind: "pull-request" }>;
}) {
  const rowMotion = useRowMotion();
  const localeName = useLocaleName();

  return (
    <MockWindow
      title={`${visual.repo} · #${visual.number}`}
      icon={
        <Image
          src="/images/github-logo.svg"
          alt=""
          width={14}
          height={14}
          className="size-3.5 dark:invert"
        />
      }
    >
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold tracking-[-0.01em]">
            {visual.title}{" "}
            <span className="font-normal text-muted-foreground">#{visual.number}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2 text-[0.7rem] text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 font-medium text-white">
              <GitPullRequestIcon aria-hidden weight="bold" className="size-3" />
              Open
            </span>
            <code className="rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-sky-700 dark:text-sky-300">
              {visual.branch}
            </code>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border">
          <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3.5 py-2 text-[0.72rem]">
            <span
              aria-hidden
              className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
            >
              <SparkleIcon weight="fill" className="size-3" />
            </span>
            <span className="font-semibold">
              <FormattedMessage {...sharedMessages.mockAgentName} />
            </span>
            <span className="text-muted-foreground">
              <FormattedMessage {...sharedMessages.mockPrCommented} />
            </span>
          </div>
          <div className="flex flex-col gap-3 bg-background p-3.5">
            <p className="text-[0.78rem] font-medium">
              <FormattedMessage {...visual.summary} />
            </p>
            <table className="w-full text-left text-[0.74rem]">
              <thead>
                <tr className="text-muted-foreground">
                  <th scope="col" className="pb-1.5 font-medium">
                    <FormattedMessage {...sharedMessages.mockPrLocaleColumn} />
                  </th>
                  <th scope="col" className="pb-1.5 font-medium">
                    <FormattedMessage {...sharedMessages.mockPrResultColumn} />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visual.rows.map((row, index) => (
                  <motion.tr key={row.locale} {...rowMotion(index)}>
                    <td className="py-1.5 pe-3">
                      <span className="font-mono text-[0.68rem] text-muted-foreground">
                        {row.locale}
                      </span>{" "}
                      <span className="font-medium">{localeName(row.locale)}</span>
                    </td>
                    <td className="py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <StatusChip status={row.status} compact />
                        <FormattedMessage {...row.label} />
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MockWindow>
  );
}

const METRIC_TONES = {
  good: "text-emerald-600 dark:text-emerald-400",
  watch: "text-amber-600 dark:text-amber-400",
  neutral: "text-muted-foreground",
} as const;

function MetricsMock({ visual }: { visual: Extract<UseCaseMockVisual, { kind: "metrics" }> }) {
  const rowMotion = useRowMotion();
  const reduceMotion = useReducedMotion();
  const maxBar = Math.max(1, ...(visual.bars ?? []).map((bar) => bar.value));

  return (
    <AppWindow>
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <PanelHeading
          title={<FormattedMessage {...visual.title} />}
          subtitle={visual.subtitle ? <FormattedMessage {...visual.subtitle} /> : undefined}
        />
        <div className="grid grid-cols-3 gap-2">
          {visual.metrics.map((metric, index) => (
            <motion.div
              key={index}
              {...rowMotion(index)}
              className="flex flex-col gap-1 rounded-xl border border-border bg-background p-3"
            >
              <span className="truncate text-[0.68rem] text-muted-foreground">
                <FormattedMessage {...metric.label} />
              </span>
              <span className="text-xl font-semibold tracking-[-0.03em] tabular-nums sm:text-2xl">
                {metric.value}
              </span>
              {metric.delta ? (
                <span
                  className={cn(
                    "text-[0.68rem] font-medium tabular-nums",
                    METRIC_TONES[metric.tone],
                  )}
                >
                  {metric.delta}
                </span>
              ) : null}
            </motion.div>
          ))}
        </div>
        {visual.bars && visual.bars.length > 0 ? (
          <div className="flex h-28 items-end gap-2 rounded-xl border border-border bg-background px-3 pb-2 pt-3">
            {visual.bars.map((bar, index) => (
              <div
                key={bar.label}
                className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
              >
                <motion.div
                  className="w-full max-w-10 rounded-md bg-gradient-to-t from-primary/70 to-primary/30"
                  initial={reduceMotion ? false : { height: 0 }}
                  animate={{ height: `${(bar.value / maxBar) * 100}%` }}
                  transition={{ duration: 0.8, delay: 0.2 + index * 0.07, ease: EASE_OUT }}
                />
                <span className="font-mono text-[0.6rem] text-muted-foreground">{bar.label}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </AppWindow>
  );
}

function CreativeMock({ visual }: { visual: Extract<UseCaseMockVisual, { kind: "creative" }> }) {
  const rowMotion = useRowMotion();
  const localeName = useLocaleName();
  const gradients = [
    "from-[#1f2a44] via-[#3b4f8a] to-[#9fb6ff]",
    "from-[#3a1d2e] via-[#8a3b5f] to-[#ffb3c7]",
    "from-[#16332b] via-[#2f6f5c] to-[#a6f0d2]",
  ];

  return (
    <AppWindow>
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <PanelHeading title={<FormattedMessage {...visual.title} />} />
        <div
          className={cn(
            "grid gap-3",
            visual.variants.length === 2 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-3",
          )}
        >
          {visual.variants.map((variant, index) => (
            <motion.figure
              key={index}
              {...rowMotion(index)}
              className={cn(
                "flex flex-col overflow-hidden rounded-xl border border-border bg-background",
              )}
            >
              <div
                className={cn(
                  "relative flex aspect-[4/3] flex-col justify-end gap-1 bg-gradient-to-br p-3 text-white",
                  gradients[index % gradients.length],
                )}
              >
                <span
                  aria-hidden
                  className="absolute end-2 top-2 size-6 rounded-full bg-white/25 backdrop-blur"
                />
                <p
                  className="text-[0.9rem] font-semibold leading-tight tracking-[-0.02em]"
                  lang={variant.locale}
                >
                  {variant.headline}
                </p>
                <p className="text-[0.68rem] leading-snug text-white/80" lang={variant.locale}>
                  {variant.body}
                </p>
              </div>
              <figcaption className="flex items-center justify-between gap-2 px-3 py-2 text-[0.7rem]">
                <span className="truncate font-medium">
                  {variant.note ? (
                    <FormattedMessage {...variant.note} />
                  ) : (
                    localeName(variant.locale)
                  )}
                </span>
                <StatusChip status={variant.status} compact />
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </div>
    </AppWindow>
  );
}

/** Renders any mock described in a use case story. */
export function UseCaseMockVisualView({ visual }: { visual: UseCaseMockVisual }) {
  switch (visual.kind) {
    case "chat":
      return <ChatMock visual={visual} />;
    case "terminal":
      return <TerminalMock visual={visual} />;
    case "checklist":
      return <ChecklistMock visual={visual} />;
    case "locales":
      return <LocalesMock visual={visual} />;
    case "strings":
      return <StringsMock visual={visual} />;
    case "pull-request":
      return <PullRequestMock visual={visual} />;
    case "metrics":
      return <MetricsMock visual={visual} />;
    case "creative":
      return <CreativeMock visual={visual} />;
  }
}
