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

export const projectFilesTreeMessages = defineMessages({
  ariaLabel: {
    defaultMessage: "Project files",
    id: "rOUXYb0uIa",
    description: "Accessible name for the project files tree",
  },
  searchFiles: {
    defaultMessage: "Search files",
    id: "ZsYP7x8uWu",
    description: "Accessible label for the project files tree search input",
  },
  providerFile: {
    defaultMessage: "Provider file",
    id: "P9C1n98DZ2",
    description: "Metadata label for a TMS provider file resource in the files tree",
  },
  providerKey: {
    defaultMessage: "Provider key",
    id: "D/ZccJ6VSq",
    description: "Metadata label for a TMS provider key resource in the files tree",
  },
  uploaded: {
    defaultMessage: "Uploaded",
    id: "7mOZ9ibLkT",
    description: "Status badge when a native project file has no latest job",
  },
});
