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

export const projectFormMessages = defineMessages({
  nameRequired: {
    defaultMessage: "Project name is required.",
    id: "WXIoLiZoe5",
    description: "Validation error when the project name is empty",
  },
  nameTooLong: {
    defaultMessage: "Project name must be 200 characters or fewer.",
    id: "yDkVK1WUtt",
    description: "Validation error when the project name exceeds 200 characters",
  },
  identifierRequired: {
    defaultMessage: "Identifier is required.",
    id: "PhCueSOzW6",
    description: "Validation error when the project issue identifier is empty",
  },
  identifierInvalid: {
    defaultMessage:
      "Identifier must be 1–10 characters, start with a letter, and use only letters and numbers.",
    id: "A87DLxXSk5",
    description: "Validation error when the project issue identifier format is invalid",
  },
  descriptionTooLong: {
    defaultMessage: "Description must be 10,000 characters or fewer.",
    id: "Ckfjf7HRih",
    description: "Validation error when the project description exceeds 10,000 characters",
  },
  translationContextTooLong: {
    defaultMessage: "Translation context must be 20,000 characters or fewer.",
    id: "Ic0GDPpTRm",
    description: "Validation error when translation context exceeds 20,000 characters",
  },
  invalidSourceLocale: {
    defaultMessage: "Select a valid source locale.",
    id: "QhAcz8vXW1",
    description: "Validation error when the source locale is invalid",
  },
  sourceInTargets: {
    defaultMessage: "Remove the source locale from target locales.",
    id: "g2vXuLe4hc",
    description: "Validation error when the source locale is also selected as a target",
  },
  targetLocalesRequired: {
    defaultMessage: "Select at least one valid target locale.",
    id: "X9X74tk3Lj",
    description: "Validation error when no valid target locales are selected",
  },
  noLocalesConfigured: {
    defaultMessage: "No locales configured",
    id: "Up5yLUnVpF",
    description: "Summary when a project has no source or target locales",
  },
  localeSummary: {
    defaultMessage: "{source} → {targets}",
    id: "y0gXcEiYv6",
    description: "Summary of a project’s source locale and target locales",
  },
});
