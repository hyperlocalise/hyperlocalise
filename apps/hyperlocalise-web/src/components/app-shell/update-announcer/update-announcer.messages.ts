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

export const updateAnnouncerMessages = defineMessages({
  notNow: {
    defaultMessage: "Not now",
    id: "0dKIqadKr+",
    description: "Dismisses the product update announcement card",
  },
  tryNow: {
    defaultMessage: "Try it now",
    id: "hSHhxI/mnH",
    description: "Opens the feature described in the product update announcement card",
  },
  dismiss: {
    defaultMessage: "Dismiss update",
    id: "lBt4D36OVV",
    description: "Accessible label for the close button on the product update announcement card",
  },
  qaOverviewTitle: {
    defaultMessage: "A clearer view of translation quality",
    id: "ZN2JBLuLUD",
    description: "Title of the product update announcement for the QA overview page",
  },
  qaOverviewDescription: {
    defaultMessage:
      "The new QA overview charts issues across every project, flags spikes as alerts, and lets you know when a scan finishes.",
    id: "yil6GR1M8a",
    description: "Body of the product update announcement for the QA overview page",
  },
});
