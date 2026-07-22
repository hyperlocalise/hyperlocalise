"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useIntl } from "react-intl";

import { chapterPlaceholderMessages } from "./chapter-placeholder.messages";
import { IntakeSourcesIllustration } from "./intake-sources-illustration";
import { type MarketingChapter } from "./marketing-page-content";
import { MonitorO11yBento } from "./monitor-o11y-bento";
import { ProviderSwitchingIllustration } from "./provider-switching-illustration";
import { ReviewPrIllustration } from "./review-pr-illustration";
import {
  type AssignmentTarget,
  TranslationFlowIllustration,
} from "./translation-flow-illustration";

export function ChapterPlaceholder({ chapter }: { chapter: MarketingChapter }) {
  const intl = useIntl();
  const agentRole = intl.formatMessage(chapterPlaceholderMessages.agentRole);

  const translationFlowAssignmentTargets: readonly AssignmentTarget[] = [
    {
      name: "OpenAI",
      role: agentRole,
      avatarUrl: "/images/openai-old-logo.webp",
    },
    {
      name: "Claude",
      role: agentRole,
      avatarUrl: "/images/claude.png",
    },
    {
      name: "Gemini",
      role: agentRole,
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
  ];

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
