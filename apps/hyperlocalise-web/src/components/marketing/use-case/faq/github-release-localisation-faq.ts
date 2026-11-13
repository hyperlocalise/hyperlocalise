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
import { faqPair } from "./faq-descriptor";
import type { UseCaseFaqDescriptor, UseCaseFaqSectionCopy } from "./use-case-faq-types";

export const githubReleaseLocalisationFaqCopy: UseCaseFaqSectionCopy = {
  heading: {
    defaultMessage: "A few things\nyou might ask.",
    id: "gRfaqHd001",
    description: "FAQ heading on the github-release-localisation use case page",
  },
  subheading: {
    defaultMessage: "Localisation checks inside your release pipeline.",
    id: "gRfaqSub01",
    description: "FAQ subheading on the github-release-localisation use case page",
  },
};

export const githubReleaseLocalisationFaqItems: UseCaseFaqDescriptor[] = [
  faqPair(
    "Can Hyperlocalise show localisation status in GitHub pull requests?",
    "gRfaqQ001",
    "GitHub release localisation FAQ about pull requests",
    "Yes. Pull requests can surface locale coverage, missing translations, and quality failures so engineering and localisation share one view before merge.",
    "gRfaqA001",
    "GitHub release localisation FAQ answer about pull requests",
  ),
  faqPair(
    "Can we block a release when translations fail quality gates?",
    "gRfaqQ002",
    "GitHub release localisation FAQ about release gates",
    "Regression checks and glossary violations can block TMS sync or deployment until reviewers approve fixes, preventing bad translations from shipping with the release.",
    "gRfaqA002",
    "GitHub release localisation FAQ answer about release gates",
  ),
  faqPair(
    "Does this replace our TMS or GitHub Actions setup?",
    "gRfaqQ003",
    "GitHub release localisation FAQ about TMS and Actions",
    "No. Hyperlocalise complements your TMS and CI/CD. It adds translation intelligence and review orchestration while GitHub remains where code and release decisions happen.",
    "gRfaqA003",
    "GitHub release localisation FAQ answer about TMS and Actions",
  ),
  faqPair(
    "How are release notes and changelog strings handled?",
    "gRfaqQ004",
    "GitHub release localisation FAQ about release notes",
    "Release-facing copy can follow the same workflow as product strings—ingested from repos or linked content, reviewed per locale, and synced when the tag ships.",
    "gRfaqA004",
    "GitHub release localisation FAQ answer about release notes",
  ),
  faqPair(
    "Can agents prepare drafts before human reviewers sign off?",
    "gRfaqQ005",
    "GitHub release localisation FAQ about agents",
    "AI agents can draft translations with full product context, then route high-risk or changed strings to human reviewers before anything merges.",
    "gRfaqA005",
    "GitHub release localisation FAQ answer about agents",
  ),
  faqPair(
    "What happens when only some locales are ready at release time?",
    "gRfaqQ006",
    "GitHub release localisation FAQ about partial locales",
    "Coverage reports show which locales are complete or blocked. Teams can ship when critical markets pass gates while unfinished locales stay out of production.",
    "gRfaqA006",
    "GitHub release localisation FAQ answer about partial locales",
  ),
  faqPair(
    "Can we try this workflow on the Free plan?",
    "gRfaqQ007",
    "GitHub release localisation FAQ about Free plan",
    "Start a Free workspace to connect GitHub, run checks on a pilot repository, and expand when your release cadence requires more automation.",
    "gRfaqA007",
    "GitHub release localisation FAQ answer about Free plan",
  ),
  faqPair(
    "Which roles benefit most from GitHub release localisation?",
    "gRfaqQ008",
    "GitHub release localisation FAQ about roles",
    "Engineering managers, release captains, and localisation operations teams use the same signals to ship confidently across markets without last-minute fire drills.",
    "gRfaqA008",
    "GitHub release localisation FAQ answer about roles",
  ),
];
