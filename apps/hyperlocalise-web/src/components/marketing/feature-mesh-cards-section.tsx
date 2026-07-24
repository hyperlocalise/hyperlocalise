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

import Image from "next/image";
import { FormattedMessage, useIntl } from "react-intl";

import { TypographyH2, TypographyH3, TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { chapterPlaceholderMessages } from "./chapter-placeholder.messages";
import { ChatDockMockSection } from "./chat-dock-mock";
import { featureMeshCardsSectionMessages } from "./feature-mesh-cards-section.messages";
import { LAVENDER_MESH_GRADIENT_SRC, SAGE_MESH_GRADIENT_SRC } from "./hero-frame-mesh-stage";
import { AutomationEditorIllustration } from "./automation-editor-illustration";
import { SlackLaunchIntakeIllustration } from "./slack-launch-intake-illustration";
import {
  type AssignmentTarget,
  TranslationFlowIllustration,
} from "./translation-flow-illustration";

const WARM_MESH_GRADIENT_SRC = "/images/mesh/mesh-gradient-1784863888954.jpg";
const DUSK_MESH_GRADIENT_SRC = "/images/mesh/mesh-gradient-1784863799475.jpg";

function useTranslationFlowTargets(): readonly AssignmentTarget[] {
  const intl = useIntl();
  const agentRole = intl.formatMessage(chapterPlaceholderMessages.agentRole);

  return [
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
}

function FeatureMeshCard({
  title,
  body,
  meshSrc,
  className,
  children,
}: {
  title: typeof featureMeshCardsSectionMessages.intakeTitle;
  body: typeof featureMeshCardsSectionMessages.intakeBody;
  meshSrc: string;
  className?: string;
  children?: ReactNode;
}) {
  const hasVisual = Boolean(children);

  return (
    <article
      className={cn(
        "relative isolate overflow-hidden rounded-[1.5rem] shadow-[0_20px_48px_rgba(0,0,0,0.16)] sm:rounded-[1.75rem]",
        hasVisual ? "min-h-0" : "min-h-[18rem] sm:min-h-[20rem]",
        className,
      )}
    >
      <Image
        src={meshSrc}
        alt=""
        aria-hidden
        fill
        sizes="(min-width: 1024px) 36rem, 100vw"
        className="object-cover object-center"
      />
      <div
        className={cn(
          "absolute inset-0",
          hasVisual
            ? "bg-gradient-to-b from-black/55 via-black/30 to-black/55"
            : "bg-gradient-to-t from-black/70 via-black/35 to-black/10",
        )}
        aria-hidden
      />
      <div
        className={cn(
          "relative flex h-full flex-col gap-4 p-5 sm:p-7",
          hasVisual ? "justify-between" : "min-h-[18rem] justify-end sm:min-h-[20rem]",
        )}
      >
        <div className="space-y-3">
          <TypographyH3 className="pb-0 text-[1.35rem] leading-[1.15] font-semibold tracking-[-0.035em] text-white sm:text-[1.55rem]">
            <FormattedMessage {...title} />
          </TypographyH3>
          <TypographyP className="max-w-md pb-0 text-[0.95rem] leading-relaxed text-white/85">
            <FormattedMessage {...body} />
          </TypographyP>
        </div>
        {children ? <div className="min-w-0">{children}</div> : null}
      </div>
    </article>
  );
}

export function FeatureMeshCardsSection() {
  const translationFlowTargets = useTranslationFlowTargets();

  return (
    <section id="features" aria-labelledby="feature-mesh-cards-heading">
      <TypographyH2
        id="feature-mesh-cards-heading"
        className="max-w-3xl pb-0 text-[1.85rem] leading-[1.12] font-semibold tracking-[-0.04em] sm:text-4xl md:text-5xl"
      >
        <FormattedMessage {...featureMeshCardsSectionMessages.headline} />
      </TypographyH2>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-12 sm:gap-5 md:grid-cols-2 md:gap-6">
        <FeatureMeshCard
          title={featureMeshCardsSectionMessages.intakeTitle}
          body={featureMeshCardsSectionMessages.intakeBody}
          meshSrc={WARM_MESH_GRADIENT_SRC}
        >
          <SlackLaunchIntakeIllustration embedded />
        </FeatureMeshCard>

        <FeatureMeshCard
          title={featureMeshCardsSectionMessages.orchestrationTitle}
          body={featureMeshCardsSectionMessages.orchestrationBody}
          meshSrc={SAGE_MESH_GRADIENT_SRC}
        >
          <TranslationFlowIllustration
            assignmentTargets={translationFlowTargets}
            className="shadow-[0_24px_64px_rgba(0,0,0,0.28)]"
          />
        </FeatureMeshCard>

        <FeatureMeshCard
          title={featureMeshCardsSectionMessages.contextTitle}
          body={featureMeshCardsSectionMessages.contextBody}
          meshSrc={LAVENDER_MESH_GRADIENT_SRC}
        >
          <ChatDockMockSection embedded />
        </FeatureMeshCard>

        <FeatureMeshCard
          title={featureMeshCardsSectionMessages.releaseTitle}
          body={featureMeshCardsSectionMessages.releaseBody}
          meshSrc={DUSK_MESH_GRADIENT_SRC}
        >
          <AutomationEditorIllustration />
        </FeatureMeshCard>
      </div>
    </section>
  );
}
