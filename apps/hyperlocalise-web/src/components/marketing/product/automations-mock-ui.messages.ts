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
    defaultMessage: "Stop chasing localisation work across tools",
    id: "VRLc3wPzw1",
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

  useCaseAutoTranslationTitle: {
    defaultMessage: "Auto Translation",
    id: "JoyCXV9ci7",
    description: "Automations mock UI use case 1 title",
  },
  useCaseAutoTranslationDescription: {
    defaultMessage: "Detect string changes and translate automatically",
    id: "HV+orx8sr6",
    description: "Automations mock UI use case 1 description",
  },
  useCaseReviewWithAgentTitle: {
    defaultMessage: "Review with Agent",
    id: "juC/UYo14l",
    description: "Automations mock UI use case 2 title",
  },
  useCaseReviewWithAgentDescription: {
    defaultMessage: "Review translations for quality before release",
    id: "5gOsIVBri/",
    description: "Automations mock UI use case 2 description",
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
  triggerGithubMain: {
    defaultMessage: "GitHub push · main",
    id: "eyBOSuClwi",
    description: "Automations mock UI trigger label for GitHub push to main",
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

  step2Review1: {
    defaultMessage: "Scanning changed source strings...",
    id: "smcq1fCig2",
    description: "Automations mock UI review with agent step 1",
  },
  step2Review2: {
    defaultMessage: "Checked for missing context & key churn",
    id: "WXiWMxn46f",
    description: "Automations mock UI review with agent step 2",
  },
  step2Review3: {
    defaultMessage: "Validated ICU syntax & placeholders",
    id: "NJcIVnfImQ",
    description: "Automations mock UI review with agent step 3",
  },
  step2Review4: {
    defaultMessage: "2 blocking issues found · notifying Slack",
    id: "OckWNLNmqY",
    description: "Automations mock UI review with agent step 4 — warning state",
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
