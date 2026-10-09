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

export const intercomPushUiMessages = defineMessages({
  pushButton: {
    id: "9B07etsjy7",
    defaultMessage: "Push to Intercom",
    description:
      "Button that opens the dialog to write approved Help Center translations to Intercom",
  },
  pushQueued: {
    id: "xcQJbr6uuQ",
    defaultMessage: "Intercom drafts queued",
    description: "Toast after an Intercom draft push automation run is queued",
  },
  pushFailed: {
    id: "uFwOz05XQ5",
    defaultMessage: "Could not queue Intercom push",
    description: "Toast when queuing an Intercom push automation run fails",
  },
  selectArticlesTitle: {
    id: "CIOYgjMx73",
    defaultMessage: "Push to Intercom",
    description: "Title of the Content editor dialog for choosing Intercom articles to push",
  },
  selectArticlesDescription: {
    id: "X8lZ4XnxIR",
    defaultMessage:
      "Choose which mapped articles to write as Intercom drafts. This does not publish.",
    description: "Description of the Intercom article picker dialog",
  },
  pushPolicyLabel: {
    id: "SOxLTVdmv8",
    defaultMessage: "Push policy",
    description: "Label for the selected automation Intercom push overwrite rule",
  },
  pushPolicyOverwrite: {
    id: "qyF0LHVADJ",
    defaultMessage: "Overwrite Intercom drafts when the remote target is newer.",
    description: "Explains the selected automation overwrites newer Intercom drafts on push",
  },
  pushPolicyKeepRemote: {
    id: "GGSImhEeDv",
    defaultMessage:
      "Keep Intercom drafts that teammates edited after the last push. Unchanged approved text is skipped.",
    description:
      "Explains the selected automation keeps newer Intercom drafts and skips unchanged locales",
  },
  automationLabel: {
    id: "5pV4YpFmRv",
    defaultMessage: "Automation",
    description: "Label for choosing which Intercom automation to push with",
  },
  searchArticlesPlaceholder: {
    id: "Lgxc1efd+d",
    defaultMessage: "Search articles",
    description: "Placeholder for filtering mapped Intercom articles",
  },
  searchArticlesLabel: {
    id: "I2X0NI6aJ0",
    defaultMessage: "Search articles",
    description: "Accessible label for the Intercom article search field",
  },
  selectAllArticles: {
    id: "7Y3h+066TE",
    defaultMessage: "Select all",
    description: "Select every mapped Intercom article in the push dialog",
  },
  clearArticleSelection: {
    id: "lp9t4iDpCF",
    defaultMessage: "Clear",
    description: "Clear the Intercom article selection",
  },
  loadingArticles: {
    id: "Sq+eRlJZgQ",
    defaultMessage: "Loading articles",
    description: "Shown while mapped Intercom articles load",
  },
  loadArticlesError: {
    id: "ahBN6E+7kk",
    defaultMessage: "Could not load articles",
    description: "Error when mapped Intercom articles fail to load",
  },
  noArticles: {
    id: "Hy5b7zz39q",
    defaultMessage: "No mapped articles",
    description: "Empty state when an Intercom automation has no mapped articles",
  },
  noMatchingArticles: {
    id: "qK3w0ogzWz",
    defaultMessage: "No matching articles",
    description: "Empty state when article search matches nothing",
  },
  readyLocales: {
    id: "107KQh5TEf",
    defaultMessage: "{ready} of {total} locales ready",
    description: "How many mapped locales are ready to push for one article",
  },
  lastPushFailed: {
    id: "j6Y+3NEXmn",
    defaultMessage: "Last push failed",
    description: "Hint that the previous Intercom push for this article failed",
  },
  cancelArticleSelection: {
    id: "Hq4FCIyo0o",
    defaultMessage: "Cancel",
    description: "Cancel the Intercom article picker",
  },
  pushSelectedArticles: {
    id: "gJQpfiFRZW",
    defaultMessage: "Push {count, plural, one {# article} other {# articles}}",
    description: "Confirm pushing the selected Intercom articles as drafts",
  },
});
