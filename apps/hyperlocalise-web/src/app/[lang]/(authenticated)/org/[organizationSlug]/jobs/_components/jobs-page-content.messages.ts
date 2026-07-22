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

export const jobsPageContentMessages = defineMessages({
  createJob: {
    defaultMessage: "Create job",
    id: "+imNjDj2UT",
    description: "Button to open the create job dialog from the jobs page",
  },
  loadJobsFailed: {
    defaultMessage: "Failed to load jobs",
    id: "tuH9VcQWRE",
    description: "Fallback error when native jobs fail to load",
  },
  loadTmsJobsFailed: {
    defaultMessage: "Failed to load TMS jobs",
    id: "PhiMU1WefX",
    description: "Fallback error when TMS jobs fail to load",
  },
});
