"use client";

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

  return null;
}
