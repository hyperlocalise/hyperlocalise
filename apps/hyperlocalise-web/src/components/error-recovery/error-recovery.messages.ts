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

export const errorRecoveryMessages = defineMessages({
  title: {
    defaultMessage: "We couldn't load this page",
    id: "tLThxyOpTE",
    description: "Heading shown when an application route fails unexpectedly",
  },
  description: {
    defaultMessage:
      "The problem may be temporary. Try loading the page again, or return to your dashboard.",
    id: "RUWijemH62",
    description: "Guidance shown when an application route fails unexpectedly",
  },
  tryAgain: {
    defaultMessage: "Try again",
    id: "mdDGkHBHvr",
    description: "Button that retries rendering a failed application route",
  },
  goToDashboard: {
    defaultMessage: "Go to dashboard",
    id: "xSPEc7l3cj",
    description: "Link from a route error to the workspace dashboard",
  },
  contactSupport: {
    defaultMessage: "Contact support",
    id: "GfQL0NJI1y",
    description: "Link from a route error to email customer support",
  },
});
