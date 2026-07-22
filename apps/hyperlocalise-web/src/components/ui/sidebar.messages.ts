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

export const sidebarMessages = defineMessages({
  mobileTitle: {
    defaultMessage: "Sidebar",
    id: "s+CVKzdR4F",
    description: "Accessible title for the mobile sidebar sheet",
  },
  mobileDescription: {
    defaultMessage: "Displays the mobile sidebar.",
    id: "JhA3QIY56T",
    description: "Accessible description for the mobile sidebar sheet",
  },
  collapse: {
    defaultMessage: "Collapse Sidebar",
    id: "aFBvwlBhSp",
    description: "Label and tooltip when the sidebar is expanded and can be collapsed",
  },
  expand: {
    defaultMessage: "Expand Sidebar",
    id: "8akVFVMFrZ",
    description: "Label and tooltip when the sidebar is collapsed and can be expanded",
  },
});
