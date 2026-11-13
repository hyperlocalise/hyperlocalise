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
import { githubReleaseLocalisationStory } from "./stories/github-release-localisation";
import { helpCenterLocalisationStory } from "./stories/help-center-localisation";
import { localisationCliAndApiStory } from "./stories/localisation-cli-and-api";
import { localisationForAiCodingAgentsStory } from "./stories/localisation-for-ai-coding-agents";
import { localisationOperationsStory } from "./stories/localisation-operations";
import { localisationQualityMonitoringStory } from "./stories/localisation-quality-monitoring";
import { marketEntryStory } from "./stories/market-entry";
import { marketExperimentationStory } from "./stories/market-experimentation";
import { marketingLocalisationStory } from "./stories/marketing-localisation";
import type { UseCaseStory } from "./use-case-story-types";

const STORIES: UseCaseStory[] = [
  localisationOperationsStory,
  localisationQualityMonitoringStory,
  helpCenterLocalisationStory,
  marketEntryStory,
  marketingLocalisationStory,
  marketExperimentationStory,
  githubReleaseLocalisationStory,
  localisationCliAndApiStory,
  localisationForAiCodingAgentsStory,
];

export const useCaseStoriesBySlug: Record<string, UseCaseStory> = Object.fromEntries(
  STORIES.map((story) => [story.slug, story]),
);
