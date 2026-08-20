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
import { defineMessages } from "react-intl";

export const githubAutoReviewCardMessages = defineMessages({
  sectionTitle: {
    defaultMessage: "From Hyperlocalise",
    id: "UbMdijMS9Y",
    description: "Section heading for built-in Hyperlocalise automations",
  },
  title: {
    defaultMessage: "Auto-review",
    id: "8Fgee/wHWH",
    description: "Title of the built-in GitHub Auto-review automation",
  },
  description: {
    defaultMessage:
      "Review pull requests for localisation issues and post one sticky comment when a pull request opens, updates, or is marked ready.",
    id: "Z1pfbdxKYT",
    description: "Description of GitHub Auto-review on the Automations page",
  },
  mentionNote: {
    defaultMessage:
      "@hyperlocalise review runs the same review on demand and uses this additional prompt, even when Auto-review is off. Extra text after review is ignored.",
    id: "w8MNmtWiyM",
    description: "Note that mention review shares the Auto-review prompt",
  },
  enabledLabel: {
    defaultMessage: "Enable Auto-review",
    id: "I9H84YoLOE",
    description: "Switch label that turns GitHub Auto-review on or off",
  },
  repositoriesLabel: {
    defaultMessage: "Repositories",
    id: "F+fcXXTQxm",
    description: "Label for the Auto-review repository checklist",
  },
  additionalPromptLabel: {
    defaultMessage: "Additional prompt",
    id: "K4rbhysR0U",
    description: "Label for the shared Auto-review additional prompt",
  },
  additionalPromptPlaceholder: {
    defaultMessage: "Optional. Extra localisation review instructions for this workspace.",
    id: "Gs4Pgl/iTx",
    description: "Placeholder for the Auto-review additional prompt textarea",
  },
  noGithub: {
    defaultMessage: "Connect GitHub in Integrations to choose repositories.",
    id: "Bn0C5KWma3",
    description: "Empty state when the workspace has no GitHub repositories",
  },
  noEnabledRepos: {
    defaultMessage: "Enable a GitHub repository in Integrations to use Auto-review.",
    id: "pebrGi1pcR",
    description: "Empty state when GitHub repos exist but none are enabled",
  },
  integrationsLink: {
    defaultMessage: "Open Integrations",
    id: "Df4sRuRJe/",
    description: "Link from Auto-review settings to the Integrations page",
  },
  save: {
    defaultMessage: "Save",
    id: "QU4Ror5CEN",
    description: "Button that saves GitHub Auto-review settings",
  },
  saveSuccess: {
    defaultMessage: "Auto-review settings saved.",
    id: "TOG2/DBCrL",
    description: "Toast after Auto-review settings save successfully",
  },
  saveError: {
    defaultMessage: "Could not save Auto-review settings.",
    id: "2TU1e5TxSn",
    description: "Toast when Auto-review settings fail to save",
  },
  loadError: {
    defaultMessage: "Auto-review settings failed to load.",
    id: "BObFUJ/lEj",
    description: "Error title when Auto-review settings fail to load",
  },
});
