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

export const jobFailureNoticeMessages = defineMessages({
  failedTitle: {
    defaultMessage: "This job failed",
    id: "I6LgL+Y3rV",
    description: "Heading on the job detail failure notice",
  },
  partialTitle: {
    defaultMessage: "Some locales still need translation",
    id: "gQTLQI8WWt",
    description: "Heading when a job finished some locales and left others for retry",
  },
  failedLocales: {
    defaultMessage: "Unfinished locales: {locales}",
    id: "EfNE1Pwz+v",
    description: "Lists locales that did not finish in a file translation job",
  },
  followUpLink: {
    defaultMessage: "Open retry job",
    id: "taC1Y4ZVNm",
    description: "Link to the automatic follow-up job for leftover locales",
  },
});
