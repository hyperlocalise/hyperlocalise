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

export const accountProfileFormMessages = defineMessages({
  sectionTitle: {
    defaultMessage: "Profile",
    id: "dwrrquikgT",
    description: "Section heading for the signed-in user profile on account settings",
  },
  sectionDescription: {
    defaultMessage: "Your name is stored on your Hyperlocalise account. Email comes from WorkOS.",
    id: "GzYGhS8+WR",
    description: "Helper text under the profile section on account settings",
  },
  firstName: {
    defaultMessage: "First name",
    id: "bTrlcQgKy7",
    description: "Label for the first name field on account settings",
  },
  lastName: {
    defaultMessage: "Last name",
    id: "1vue8PV3d2",
    description: "Label for the last name field on account settings",
  },
  email: {
    defaultMessage: "Email",
    id: "2ynzQ185js",
    description: "Label for the readonly user email field on account settings",
  },
  firstNameRequired: {
    defaultMessage: "First name is required.",
    id: "QBLs7J0ZVO",
    description: "Validation when first name is empty on account settings",
  },
  saveError: {
    defaultMessage: "Could not save your name.",
    id: "ywy4KPnDer",
    description: "Toast when account name fails to save",
  },
});
