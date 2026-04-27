import { MessageUser01Icon, WorkflowSquare10Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/lib/utils";

import { IntakeSourcesIllustration } from "./intake-sources-illustration";
import { type MarketingChapter } from "./marketing-page-content";
import { MonitorO11yBento } from "./monitor-o11y-bento";
import { ProviderSwitchingIllustration } from "./provider-switching-illustration";
import { ReviewPrIllustration } from "./review-pr-illustration";
import {
  type AssignmentTarget,
  TranslationFlowIllustration,
} from "./translation-flow-illustration";

const translationFlowAssignmentTargets: readonly AssignmentTarget[] = [
  {
    name: "OpenAI",
    role: "Agent",
    avatarUrl: "/images/openai-old-logo.webp",
  },
  {
    name: "Claude",
    role: "Agent",
    avatarUrl: "/images/claude.png",
  },
  {
    name: "Gemini",
    role: "Agent",
    avatarUrl: "/images/gemini.webp",
  },
  {
    name: "Michael",
    avatarUrl: "/images/profile/michael.png",
  },
  {
    name: "Bella",
    avatarUrl: "/images/profile/bella.png",
  },
] as const;

export function ChapterPlaceholder({ chapter }: { chapter: MarketingChapter }) {
  if (chapter.id === "01") {
    return <IntakeSourcesIllustration />;
  }

  if (chapter.id === "02") {
    return <TranslationFlowIllustration assignmentTargets={translationFlowAssignmentTargets} />;
  }

  if (chapter.id === "03") {
    return <ProviderSwitchingIllustration />;
  }

  if (chapter.id === "04") {
    return <ReviewPrIllustration />;
  }

  if (chapter.id === "05") {
    return <MonitorO11yBento />;
  }

  const icon = chapter.placeholderType === "product" ? WorkflowSquare10Icon : MessageUser01Icon;

  return (
    <div className="rounded-[1.8rem] border border-border/70 bg-muted/30 p-4 shadow-[0_28px_80px_color-mix(in_srgb,var(--foreground)_10%,transparent)] sm:p-6">
      <div className="rounded-[1.5rem] border border-dashed border-border bg-background p-5 sm:p-6">
        <div className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-4" />
          {chapter.placeholderTitle}
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {chapter.placeholderDescription}
        </p>

        <div
          className={cn(
            "mt-6 grid gap-4",
            chapter.placeholderType === "product"
              ? "lg:grid-cols-[1.15fr_0.85fr]"
              : "lg:grid-cols-[0.9fr_1.1fr]",
          )}
        >
          <div className="rounded-[1.3rem] border border-border bg-muted/40 p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Reserved canvas
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {["Primary frame", "Secondary frame", "Context panel", "State details"].map(
                (item) => (
                  <div
                    key={item}
                    className="rounded-xl border border-border/70 bg-background px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    {item}
                  </div>
                ),
              )}
            </div>
          </div>
          <div className="rounded-[1.3rem] border border-border bg-muted/40 p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Layout notes
            </div>
            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <div className="rounded-xl bg-background px-4 py-4">
                Use this block for the final marketing asset.
              </div>
              <div className="rounded-xl bg-background px-4 py-4">
                Keep the composition wide and low, similar to Linear chapter visuals.
              </div>
              <div className="rounded-xl bg-background px-4 py-4">
                Preserve space for future polished screenshot or illustration work.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
