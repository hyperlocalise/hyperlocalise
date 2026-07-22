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

export const stackTraceMessages = defineMessages({
  copied: {
    id: "77onpKogma",

    defaultMessage: "Copied!",
    description: "Tooltip after stack trace is copied to the clipboard",
  },
  copyStackTrace: {
    id: "jEwAQCIVg4",

    defaultMessage: "Copy stack trace",
    description: "Tooltip and aria label for copying a stack trace",
  },
  noStackFrames: {
    id: "cKb/sPVSsm",

    defaultMessage: "No stack frames",
    description: "Empty state when a stack trace has no frames to display",
  },
  framePrefix: {
    id: "bxdlmS/zEn",

    defaultMessage: "at",
    description: "Prefix before a stack frame location in the stack trace display",
  },
});
