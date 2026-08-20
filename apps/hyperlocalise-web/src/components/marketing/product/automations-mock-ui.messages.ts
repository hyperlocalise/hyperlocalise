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
import { defineMessages } from "react-intl";

export const automationsMockMessages = defineMessages({
  eyebrow: {
    defaultMessage: "Agent Automations",
    id: "nPHyjk/RPM",
    description: "Automations mock UI eyebrow label",
  },
  headline: {
    defaultMessage: "Review localisation before it merges",
    id: "zuBGly8hc0",
    description: "Automations mock UI section heading",
  },
  botLabel: {
    defaultMessage: "Hyperlocalise · Bot",
    id: "eHZIquSdN0",
    description: "Automations mock UI terminal title bar label",
  },
  requestDemo: {
    defaultMessage: "Request a Demo",
    id: "06V6dOkQzU",
    description: "Automations mock UI call-to-action button",
  },

  useCaseAutoReviewTitle: {
    defaultMessage: "Auto-review",
    id: "aUt0Rv1wT1",
    description: "Automations mock UI Auto-review use case title",
  },
  useCaseAutoReviewDescription: {
    defaultMessage: "Review pull requests and post one sticky comment",
    id: "k2mQ8nR4vL",
    description: "Automations mock UI Auto-review use case description",
  },
  useCaseAutoTranslationTitle: {
    defaultMessage: "Auto Translation",
    id: "JoyCXV9ci7",
    description: "Automations mock UI auto translation use case title",
  },
  useCaseAutoTranslationDescription: {
    defaultMessage: "Detect string changes and translate automatically",
    id: "HV+orx8sr6",
    description: "Automations mock UI auto translation use case description",
  },
  useCaseLocalisationAuditTitle: {
    defaultMessage: "Localisation Audit",
    id: "to5Onmz+Xc",
    description: "Automations mock UI use case 3 title",
  },
  useCaseLocalisationAuditDescription: {
    defaultMessage: "Check hreflang, RTL support, terminology and compliance",
    id: "gNb7LVmFTm",
    description: "Automations mock UI use case 3 description",
  },

  triggerSourceUpload: {
    defaultMessage: "Source upload",
    id: "SZbykgpUeM",
    description: "Automations mock UI trigger label for source upload",
  },
  triggerGithubPullRequest: {
    defaultMessage: "GitHub pull request opened",
    id: "pR0p3n3dHq",
    description: "Automations mock UI trigger label for a GitHub pull request opening",
  },
  triggerGithubRelease: {
    defaultMessage: "GitHub push · release/*",
    id: "QgJDE+xhbx",
    description: "Automations mock UI trigger label for GitHub push to release",
  },

  toolCreateJob: {
    defaultMessage: "Create job",
    id: "01u9U8ASiI",
    description: "Automations mock UI tool label",
  },
  toolTranslateWithAgent: {
    defaultMessage: "Translate with agent",
    id: "qMPafsI8mp",
    description: "Automations mock UI tool label",
  },
  toolGitHub: {
    defaultMessage: "GitHub",
    id: "lsxAaZycti",
    description: "Automations mock UI tool label",
  },
  toolValidation: {
    defaultMessage: "Validation",
    id: "qfZTKSfQgm",
    description: "Automations mock UI tool label",
  },
  toolMentionReview: {
    defaultMessage: "@hyperlocalise review",
    id: "m3nT10nRv1",
    description: "Automations mock UI tool label for the mention review command",
  },
  toolSlack: {
    defaultMessage: "Slack",
    id: "SWV7AxBTg5",
    description: "Automations mock UI tool label",
  },

  step1Auto1: {
    defaultMessage: "Reading uploaded source file...",
    id: "Tpf2GEAF9w",
    description: "Automations mock UI auto translation step 1",
  },
  step1Auto2: {
    defaultMessage: "Source file detected · 24 strings",
    id: "o1YK/dYPDZ",
    description: "Automations mock UI auto translation step 2",
  },
  step1Auto3: {
    defaultMessage: "Creating translation job for FR, DE, JA...",
    id: "6Z1HHKVZs9",
    description: "Automations mock UI auto translation step 3",
  },
  step1Auto4: {
    defaultMessage: "Translation job created",
    id: "wsDlv0gzm0",
    description: "Automations mock UI auto translation step 4",
  },
  step1Auto5: {
    defaultMessage: "Agent assigned · translating now",
    id: "T+F7HlwHlj",
    description: "Automations mock UI auto translation step 5",
  },

  stepAutoReview1: {
    defaultMessage: "Pull request opened on checkout-fr",
    id: "aR3vStp001",
    description: "Automations mock UI Auto-review step 1",
  },
  stepAutoReview2: {
    defaultMessage: "Reading localisation diff...",
    id: "aR3vStp002",
    description: "Automations mock UI Auto-review step 2",
  },
  stepAutoReview3: {
    defaultMessage: "Checked missing translations and placeholders",
    id: "aR3vStp003",
    description: "Automations mock UI Auto-review step 3",
  },
  stepAutoReview4: {
    defaultMessage: "Posted sticky review comment",
    id: "aR3vStp004",
    description: "Automations mock UI Auto-review step 4",
  },

  step3Audit1: {
    defaultMessage: "Checking locale coverage expectations...",
    id: "y8Gkw54qZc",
    description: "Automations mock UI localisation audit step 1",
  },
  step3Audit2: {
    defaultMessage: "FR 100% · DE 98% · JA 87% coverage",
    id: "/u4S4pwmIn",
    description: "Automations mock UI localisation audit step 2",
  },
  step3Audit3: {
    defaultMessage: "Arabic (ar) RTL layout not detected",
    id: "/CA59wrwPr",
    description: "Automations mock UI localisation audit step 3 — warning state",
  },
  step3Audit4: {
    defaultMessage: "Verifying ICU syntax & placeholders...",
    id: "JaqIVrRaDX",
    description: "Automations mock UI localisation audit step 4",
  },
  step3Audit5: {
    defaultMessage: "No placeholder regressions found",
    id: "N3wHJrm6Ss",
    description: "Automations mock UI localisation audit step 5",
  },
  step3Audit6: {
    defaultMessage: "Audit report sent to Slack",
    id: "GoCK8c5u+Q",
    description: "Automations mock UI localisation audit step 6",
  },
});

export type AutomationsMockMessageKey = keyof typeof automationsMockMessages;
