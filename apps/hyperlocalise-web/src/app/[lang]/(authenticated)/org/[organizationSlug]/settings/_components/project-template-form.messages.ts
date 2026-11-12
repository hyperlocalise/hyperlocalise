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
"use client";

import { defineMessages } from "react-intl";

export const projectTemplateFormMessages = defineMessages({
  nameRequired: {
    defaultMessage: "Enter a template name.",
    id: "lDqKdjmLTP",
    description: "Validation error when a project template has no name",
  },
  tooLong: {
    defaultMessage: "Use at most {max, number} characters.",
    id: "UjtfsCANFW",
    description: "Validation error when a project template field is too long",
  },
  invalidSourceLocale: {
    defaultMessage: "Choose a valid source language.",
    id: "lXfi2p+NfI",
    description: "Validation error when a project template source locale is invalid",
  },
  sourceInTargets: {
    defaultMessage: "The source language can't also be a target language.",
    id: "LjseIYVieK",
    description: "Validation error when a project template target list includes the source locale",
  },
  targetLocalesRequired: {
    defaultMessage: "Choose at least one target language.",
    id: "JFrmFtTCwm",
    description: "Validation error when a project template has no target locales",
  },
  tooManyResources: {
    defaultMessage: "Choose at most {max, number}.",
    id: "gek9fCI2fK",
    description:
      "Validation error when a project template attaches too many memories or glossaries",
  },
});
