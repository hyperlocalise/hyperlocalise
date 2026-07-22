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

export const jobDetailViewMessages = defineMessages({
  propertiesHeading: {
    defaultMessage: "Properties",
    id: "YzeA1Ot+Qo",
    description: "Heading for the job detail properties sidebar card",
  },
  hideSecondaryPropertiesAriaLabel: {
    defaultMessage: "Hide secondary task properties",
    id: "8ZSRxiImW7",
    description: "Accessible label when secondary job properties are expanded",
  },
  showSecondaryPropertiesAriaLabel: {
    defaultMessage: "Show secondary task properties",
    id: "uRizX81sIF",
    description: "Accessible label when secondary job properties are collapsed",
  },
  showLess: {
    defaultMessage: "Show less",
    id: "7OOuogoYcn",
    description: "Button label to collapse secondary job properties",
  },
  showMore: {
    defaultMessage: "Show more",
    id: "ddoWNAQtXz",
    description: "Button label to expand secondary job properties",
  },
  jobsBackLink: {
    defaultMessage: "Jobs",
    id: "O9HkCEOzPy",
    description: "Back link label from job detail to the jobs list",
  },
  emptyValue: {
    defaultMessage: "—",
    id: "1RfCN9F8ux",
    description: "Placeholder shown when a job property value is empty",
  },
});
