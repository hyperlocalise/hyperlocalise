"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const toolMessages = defineMessages({
  statusApprovalRequested: {
    id: "OQRAAutFV6",

    defaultMessage: "Awaiting Approval",
    description: "Tool status badge when approval is requested",
  },
  statusApprovalResponded: {
    id: "WpB4HHsI4I",

    defaultMessage: "Responded",
    description: "Tool status badge after approval was responded to",
  },
  statusInputAvailable: {
    id: "kBjfpWlIHs",

    defaultMessage: "Running",
    description: "Tool status badge when the tool is running",
  },
  statusInputStreaming: {
    id: "hXSssVY0i9",

    defaultMessage: "Pending",
    description: "Tool status badge when tool input is still streaming",
  },
  statusOutputAvailable: {
    id: "bg/VgRAQ0S",

    defaultMessage: "Completed",
    description: "Tool status badge when the tool completed successfully",
  },
  statusOutputDenied: {
    id: "he2yTle2zW",

    defaultMessage: "Denied",
    description: "Tool status badge when tool output was denied",
  },
  statusOutputError: {
    id: "F1KUlqpyf6",

    defaultMessage: "Error",
    description: "Tool status badge when the tool returned an error",
  },
  parameters: {
    id: "M4h3UcxULX",

    defaultMessage: "Parameters",
    description: "Section heading for tool input parameters",
  },
  result: {
    id: "Rg44t9f2lQ",

    defaultMessage: "Result",
    description: "Section heading for successful tool output",
  },
  error: {
    id: "/Kp0jW/NO6",

    defaultMessage: "Error",
    description: "Section heading for tool error output",
  },
  fallbackName: {
    id: "Kph9F7aQfL",
    defaultMessage: "Tool",
    description: "Fallback tool name when the tool type cannot be derived",
  },
});
