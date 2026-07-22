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

export const workspaceSettingsFormMessages = defineMessages({
  updateFailed: {
    defaultMessage: "Failed to update workspace",
    id: "94S5baAyIV",
    description: "Fallback error when updating workspace name or slug fails",
  },
  updatedToast: {
    defaultMessage: "Workspace updated",
    id: "Jtv0kZNXI2",
    description: "Success toast after workspace settings are saved",
  },
  organizationNameLabel: {
    defaultMessage: "Organization name",
    id: "Zc3aO7AdzZ",
    description: "Label for the organization name field on account settings",
  },
  workspaceSlugLabel: {
    defaultMessage: "Workspace slug",
    id: "78OEnC/JOf",
    description: "Label for the workspace slug field on account settings",
  },
  save: {
    defaultMessage: "Save",
    id: "AyLloycARU",
    description: "Submit button to save workspace settings",
  },
});
