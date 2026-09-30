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

export const jobsGroupedListMessages = defineMessages({
  collapseGroupAria: {
    defaultMessage: "Collapse {status}",
    id: "vB4gk8khYa",
    description: "Accessible label to collapse a job status group",
  },
  expandGroupAria: {
    defaultMessage: "Expand {status}",
    id: "3UJV/6yCWv",
    description: "Accessible label to expand a job status group",
  },
  loadingAria: {
    defaultMessage: "Loading jobs",
    id: "Hsz2q13V4l",
    description: "Accessible label while the grouped jobs list is loading",
  },
  otherGroup: {
    defaultMessage: "Other",
    id: "f3pu4K7abu",
    description: "Status group label for jobs with an unrecognized status",
  },
});
