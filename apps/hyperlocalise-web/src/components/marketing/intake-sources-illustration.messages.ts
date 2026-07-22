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
import { defineMessages } from "react-intl";

export const intakeSourcesIllustrationMessages = defineMessages({
  sourcesLabel: {
    defaultMessage: "Sources",
    id: "NNchKY9/XJ",
    description: "Label above the intake sources illustration cards",
  },
  sourcesSummary: {
    defaultMessage: "GitHub, Slack, Claude",
    id: "MIEsl8O6RO",
    description: "Summary of intake source types shown next to the Sources label",
  },
  githubBadge: {
    defaultMessage: "Pull request",
    id: "ZVaGoLGTAL",
    description: "Badge on the GitHub intake source card",
  },
  changedFiles: {
    defaultMessage: "Changed files",
    id: "DBLlz9lyki",
    description: "Label above the changed files list on the GitHub intake card",
  },
  localeUpdatesPill: {
    defaultMessage: "3 locale updates",
    id: "ictHRXxdsq",
    description: "Pill showing locale update count on the GitHub intake card",
  },
  driftReadyPill: {
    defaultMessage: "drift ready",
    id: "c3udbicBEE",
    description: "Pill indicating drift readiness on the GitHub intake card",
  },
  githubCardTitle: {
    defaultMessage: "Repo changes become intake.",
    id: "0DciqLd38A",
    description: "Title at the bottom of the GitHub intake source card",
  },
  githubCardBody: {
    defaultMessage: "Pull request diffs arrive with file context intact.",
    id: "OzDfve+0GF",
    description: "Supporting copy on the GitHub intake source card",
  },
  slackBadge: {
    defaultMessage: "Request",
    id: "yRk3vbJPiR",
    description: "Badge on the Slack intake source card",
  },
  slackNewRequest: {
    defaultMessage: "New request",
    id: "5TIAjleUB+",
    description: "Secondary label under the Slack channel name on the intake card",
  },
  slackMessage: {
    defaultMessage: "Need hero copy and pricing updates translated for the Friday campaign launch.",
    id: "is1xcsCexC",
    description: "Mock Slack request message on the intake sources illustration",
  },
  launchCopyPill: {
    defaultMessage: "Launch copy",
    id: "ZNq2uixHCz",
    description: "Pill tag on the Slack intake request card",
  },
  slackCardTitle: {
    defaultMessage: "Requests arrive with urgency.",
    id: "F1DLNy4mAV",
    description: "Title at the bottom of the Slack intake source card",
  },
  slackCardBody: {
    defaultMessage: "Timing and locale targets stay attached from the start.",
    id: "b4k8FO+SjC",
    description: "Supporting copy on the Slack intake source card",
  },
  claudeCardTitle: {
    defaultMessage: "Trigger translation",
    id: "535vN7Xlt0",
    description: "Title at the bottom of the Anthropic/Claude intake source card",
  },
  claudeCardBody: {
    defaultMessage:
      "Claude can start Hyperlocalise work with locale scope and source context attached.",
    id: "23HR063Kml",
    description: "Supporting copy on the Anthropic/Claude intake source card",
  },
});
