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

export const issueDuplicateBannerMessages = defineMessages({
  title: {
    defaultMessage: "This issue is a duplicate",
    id: "AE4hE6vozP",
    description: "Title of the banner shown when an issue is marked as a duplicate",
  },
  description: {
    defaultMessage: "Marked as a duplicate of {title}",
    id: "lXuIhCcGl8",
    description: "Description of the duplicate banner, {title} is the canonical issue's title",
  },
  viewCanonical: {
    defaultMessage: "View original issue",
    id: "C0LtvlP3Fa",
    description: "Link to the canonical issue this one is a duplicate of",
  },
});
