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
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Cancel01Icon,
  Chat01Icon,
  File01Icon,
  FileSearchIcon,
  RefreshIcon,
  SentIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Tool, ToolHeader } from "@/components/ai-elements/tool";
import { IntegrationLogoMark } from "@/components/marketing/integrations/integration-logo-mark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import { guidelinesBoardMockMessages as messages } from "./guidelines-board-mock.messages";

const TOOL_RESOLVE_MS = 640;
const STEP_MS = 780;
const EASE_OUT = [0.19, 1, 0.22, 1] as const;
const COLLAPSE_GLYPH = "−";
const MENTION_GLYPH = "@";

type SourceId = "drive" | "notion" | "sharepoint";
type ClauseId = "health" | "german" | "ai";
type PlaybackPhase = "idle" | "playing" | "done";

const SOURCE_FILES = [
  {
    id: "drive" as const,
    nameKey: "driveName",
    fileKey: "driveFile",
    metaKey: "driveMeta",
    iconKey: "googledrive" as const,
  },
  {
    id: "notion" as const,
    nameKey: "notionName",
    fileKey: "notionFile",
    metaKey: "notionMeta",
    iconKey: "notion" as const,
  },
  {
    id: "sharepoint" as const,
    nameKey: "sharepointName",
    fileKey: "sharepointFile",
    metaKey: "sharepointMeta",
    logoSrc: "/images/sharepoint-logo.svg",
  },
] as const;

const PDF_CLAUSES = [
  { id: "health" as const, titleKey: "clauseHealthTitle", bodyKey: "clauseHealthBody" },
  { id: "german" as const, titleKey: "clauseGermanTitle", bodyKey: "clauseGermanBody" },
  { id: "ai" as const, titleKey: "clauseAiTitle", bodyKey: "clauseAiBody" },
] as const;

const FLAGS = [
  { id: "german" as const, titleKey: "flagGermanTitle", bodyKey: "flagGermanBody" },
  { id: "health" as const, titleKey: "flagHealthTitle", bodyKey: "flagHealthBody" },
  { id: "ai" as const, titleKey: "flagAiTitle", bodyKey: "flagAiBody" },
] as const;

function SourceFileButton({
  file,
  selected,
  onSelect,
}: {
  file: (typeof SOURCE_FILES)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  const intl = useIntl();

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
        selected
          ? "border-primary/40 bg-primary/10"
          : "border-border/70 bg-background hover:border-border hover:bg-muted/40",
      )}
    >
      <IntegrationLogoMark
        name={intl.formatMessage(messages[file.nameKey])}
        iconKey={"iconKey" in file ? file.iconKey : undefined}
        logoSrc={"logoSrc" in file ? file.logoSrc : undefined}
        size="sm"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          <FormattedMessage {...messages[file.fileKey]} />
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          <FormattedMessage {...messages[file.metaKey]} />
        </span>
      </span>
    </button>
  );
}

function ClaimsPdf({ highlightedClause }: { highlightedClause: ClauseId | null }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-[#f7f4ee] text-[#1d1a16] shadow-sm">
      <div className="flex items-center justify-between border-b border-[#d9d2c3] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={File01Icon} strokeWidth={1.8} className="size-4 text-[#8a3b2a]" />
          <p className="text-xs font-semibold tracking-wide uppercase">
            <FormattedMessage {...messages.pdfTitle} />
          </p>
        </div>
        <p className="text-[10px] text-[#6f675c]">
          <FormattedMessage {...messages.pdfMeta} />
        </p>
      </div>
      <div className="space-y-3 p-4">
        <p className="text-[11px] leading-5 text-[#5c564c]">
          <FormattedMessage {...messages.pdfIntro} />
        </p>
        {PDF_CLAUSES.map((clause) => {
          const isHighlighted = highlightedClause === clause.id;
          return (
            <div
              key={clause.id}
              id={`guideline-clause-${clause.id}`}
              aria-current={isHighlighted ? "true" : undefined}
              className={cn(
                "rounded-md border px-3 py-2.5 transition-colors",
                isHighlighted ? "border-[#c45c3e] bg-[#f3d7cc]" : "border-[#e4ddd0] bg-white/70",
              )}
            >
              <p className="text-[10px] font-semibold tracking-wide uppercase text-[#8a3b2a]">
                <FormattedMessage {...messages[clause.titleKey]} />
              </p>
              <p className="mt-1 text-xs leading-5">
                <FormattedMessage {...messages[clause.bodyKey]} />
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PagePreview({
  labelKey,
  bodyKey,
}: {
  labelKey: "notionPreviewLabel" | "sharepointPreviewLabel";
  bodyKey: "notionPreviewBody" | "sharepointPreviewBody";
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background p-4">
      <p className="text-[10px] font-semibold tracking-wide uppercase text-muted-foreground">
        <FormattedMessage {...messages[labelKey]} />
      </p>
      <p className="mt-3 text-sm leading-6 text-foreground">
        <FormattedMessage {...messages[bodyKey]} />
      </p>
    </div>
  );
}

function GuidelinesChat({
  phase,
  showTool,
  toolResolved,
  showAnswer,
  activeFlag,
  onSelectFlag,
  onStart,
  onReplay,
}: {
  phase: PlaybackPhase;
  showTool: boolean;
  toolResolved: boolean;
  showAnswer: boolean;
  activeFlag: ClauseId | null;
  onSelectFlag: (id: ClauseId) => void;
  onStart: () => void;
  onReplay: () => void;
}) {
  const intl = useIntl();
  const shouldReduceMotion = useReducedMotion() ?? false;
  const transcriptRef = useRef<HTMLDivElement>(null);
  const prompt = intl.formatMessage(messages.chatPrompt);
  const isBusy = phase === "playing";

  useEffect(() => {
    if (!transcriptRef.current) {
      return;
    }
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [showTool, toolResolved, showAnswer, activeFlag]);

  return (
    <div
      className="flex min-h-96 min-w-0 flex-1 flex-col overflow-hidden p-3 lg:min-h-0 lg:p-4"
      role="region"
      aria-label={intl.formatMessage(messages.chatTitle)}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl shadow-black/15">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            <FormattedMessage {...messages.chatTitle} />
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            tabIndex={-1}
            aria-label={intl.formatMessage(messages.chatCollapse)}
          >
            <span aria-hidden className="text-base leading-none">
              {COLLAPSE_GLYPH}
            </span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            tabIndex={-1}
            aria-label={intl.formatMessage(messages.chatClose)}
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
          </Button>
        </header>

        <div ref={transcriptRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {phase === "idle" ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-5 py-8 text-center">
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <HugeiconsIcon icon={Chat01Icon} strokeWidth={1.8} className="size-5" />
              </div>
              <div className="max-w-sm space-y-1">
                <h3 className="text-balance text-sm font-semibold text-foreground">
                  <FormattedMessage {...messages.chatEmptyTitle} />
                </h3>
                <p className="text-pretty text-sm text-muted-foreground">
                  <FormattedMessage {...messages.chatEmptySubtitle} />
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 rounded-full bg-background text-xs font-medium"
                onClick={onStart}
              >
                <HugeiconsIcon icon={FileSearchIcon} strokeWidth={1.8} className="size-3.5" />
                <FormattedMessage {...messages.chatSuggestion} />
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4 px-4 py-5">
              <div className="ms-auto max-w-[90%] rounded-2xl bg-muted px-3.5 py-2.5 text-pretty text-sm leading-6 text-foreground">
                {prompt}
              </div>
              <div className="space-y-3">
                <AnimatePresence initial={false}>
                  {showTool ? (
                    <motion.div
                      key="guideline-tool"
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: shouldReduceMotion ? 0 : 0.28,
                        ease: EASE_OUT,
                      }}
                      className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2"
                    >
                      <Tool defaultOpen={toolResolved}>
                        <ToolHeader
                          type="dynamic-tool"
                          toolName={intl.formatMessage(messages.toolName)}
                          state={toolResolved ? "output-available" : "input-available"}
                          detail={intl.formatMessage(messages.toolDetail)}
                          input={{ file: "Brand-claims-policy.pdf" }}
                        />
                      </Tool>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                {showAnswer ? (
                  <motion.div
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.35, ease: EASE_OUT }}
                    className="space-y-3 text-sm leading-6 text-foreground"
                  >
                    <p className="text-pretty text-muted-foreground">
                      <FormattedMessage {...messages.replyIntro} />
                    </p>
                    <div className="space-y-2">
                      {FLAGS.map((flag) => {
                        const selected = activeFlag === flag.id;
                        return (
                          <button
                            key={flag.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => onSelectFlag(flag.id)}
                            className={cn(
                              "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                              selected
                                ? "border-destructive/40 bg-destructive/10"
                                : "border-border/70 bg-background hover:bg-muted/40",
                            )}
                          >
                            <span className="block text-xs font-semibold text-destructive">
                              <FormattedMessage {...messages[flag.titleKey]} />
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                              <FormattedMessage {...messages[flag.bodyKey]} />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <form
          className="shrink-0 border-t border-border bg-background p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (phase === "done") {
              onReplay();
              return;
            }
            onStart();
          }}
        >
          <div className="overflow-hidden rounded-xl border border-border bg-muted/30 shadow-sm">
            <div className="flex flex-wrap gap-1.5 px-3 pt-3">
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[0.7rem] text-muted-foreground">
                {MENTION_GLYPH}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-[0.7rem] text-foreground">
                <HugeiconsIcon icon={File01Icon} strokeWidth={1.8} className="size-3" />
                <FormattedMessage {...messages.contextPill} />
              </span>
            </div>
            <div className="flex items-end gap-2 px-3 py-3">
              <p className="min-w-0 flex-1 text-pretty text-sm leading-5 text-foreground">
                {phase === "idle" ? (
                  prompt
                ) : (
                  <span className="text-muted-foreground">
                    <FormattedMessage {...messages.composerPlaceholder} />
                  </span>
                )}
              </p>
              {phase === "done" ? (
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  className="h-8 rounded-full px-3"
                >
                  <HugeiconsIcon
                    data-icon="inline-start"
                    icon={RefreshIcon}
                    strokeWidth={2}
                    className="size-3.5"
                  />
                  <FormattedMessage {...messages.replay} />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="sm"
                  className="h-8 rounded-full px-3"
                  disabled={isBusy}
                  aria-label={intl.formatMessage(messages.send)}
                >
                  <HugeiconsIcon
                    data-icon="inline-start"
                    icon={SentIcon}
                    strokeWidth={2}
                    className="size-3.5"
                  />
                  <FormattedMessage {...messages.send} />
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function GuidelinesBoardMock({
  autoStart = true,
  pauseAutoplay = false,
}: {
  autoStart?: boolean;
  pauseAutoplay?: boolean;
}) {
  const intl = useIntl();
  const shouldReduceMotion = useReducedMotion() ?? false;
  const hasAutoStartedRef = useRef(false);
  const playingRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [source, setSource] = useState<SourceId>("drive");
  const [phase, setPhase] = useState<PlaybackPhase>("idle");
  const [showTool, setShowTool] = useState(false);
  const [toolResolved, setToolResolved] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [activeFlag, setActiveFlag] = useState<ClauseId | null>(null);

  const clearTimers = () => {
    for (const timer of timersRef.current) {
      clearTimeout(timer);
    }
    timersRef.current = [];
  };

  const startPlayback = useCallback(() => {
    if (playingRef.current) {
      return;
    }

    playingRef.current = true;
    clearTimers();
    setSource("drive");
    setPhase("playing");
    setShowTool(false);
    setToolResolved(false);
    setShowAnswer(false);
    setActiveFlag(null);

    const schedule = (fn: () => void, delay: number) => {
      const timer = setTimeout(fn, delay);
      timersRef.current.push(timer);
    };

    let elapsed = shouldReduceMotion ? 0 : 180;
    schedule(() => setShowTool(true), elapsed);
    elapsed += shouldReduceMotion ? 0 : TOOL_RESOLVE_MS;
    schedule(() => setToolResolved(true), elapsed);
    elapsed += shouldReduceMotion ? 0 : STEP_MS;
    schedule(() => {
      setShowAnswer(true);
      setActiveFlag("german");
      setPhase("done");
      playingRef.current = false;
    }, elapsed);
  }, [shouldReduceMotion]);

  useEffect(() => {
    if (!autoStart || pauseAutoplay) {
      return;
    }

    const timer = setTimeout(
      () => {
        if (hasAutoStartedRef.current) {
          return;
        }
        hasAutoStartedRef.current = true;
        startPlayback();
      },
      shouldReduceMotion ? 0 : 500,
    );

    return () => clearTimeout(timer);
  }, [autoStart, pauseAutoplay, shouldReduceMotion, startPlayback]);

  useEffect(() => () => clearTimers(), []);

  function handleSelectFlag(id: ClauseId) {
    setSource("drive");
    setActiveFlag(id);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <div className="flex min-h-0 max-h-80 flex-col overflow-y-auto border-b border-border/50 lg:max-h-none lg:border-b-0 lg:border-r">
        <div className="border-b border-border/50 px-5 py-4">
          <p className="text-base font-semibold text-foreground">
            <FormattedMessage {...messages.boardTitle} />
          </p>
          <p className="mt-1 text-pretty text-xs text-muted-foreground">
            <FormattedMessage {...messages.boardSubtitle} />
          </p>
        </div>
        <div className="space-y-4 p-4">
          <div
            className="space-y-2"
            role="list"
            aria-label={intl.formatMessage(messages.sourceAriaLabel)}
          >
            {SOURCE_FILES.map((file) => (
              <SourceFileButton
                key={file.id}
                file={file}
                selected={source === file.id}
                onSelect={() => setSource(file.id)}
              />
            ))}
          </div>
          {source === "drive" ? (
            <ClaimsPdf highlightedClause={showAnswer ? activeFlag : null} />
          ) : null}
          {source === "notion" ? (
            <PagePreview labelKey="notionPreviewLabel" bodyKey="notionPreviewBody" />
          ) : null}
          {source === "sharepoint" ? (
            <PagePreview labelKey="sharepointPreviewLabel" bodyKey="sharepointPreviewBody" />
          ) : null}
        </div>
      </div>
      <GuidelinesChat
        phase={phase}
        showTool={showTool}
        toolResolved={toolResolved}
        showAnswer={showAnswer}
        activeFlag={activeFlag}
        onSelectFlag={handleSelectFlag}
        onStart={startPlayback}
        onReplay={startPlayback}
      />
    </div>
  );
}
