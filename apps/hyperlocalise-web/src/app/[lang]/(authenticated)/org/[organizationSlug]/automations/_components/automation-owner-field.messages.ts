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

export const automationOwnerFieldMessages = defineMessages({
  ownerLabel: {
    defaultMessage: "Owner",
    id: "otJoaVZ3hZ",
    description: "Label for the automation owner selector",
  },
  unknownOwner: {
    defaultMessage: "Unknown owner",
    id: "ZYkDjbabYQ",
    description: "Shown when the automation has no owner name",
  },
  ownersMenu: {
    defaultMessage: "Owner",
    id: "rllH5O8/Dw",
    description: "Dropdown heading for choosing an automation owner",
  },
  searchPlaceholder: {
    defaultMessage: "Search people",
    id: "488DZIs1eO",
    description: "Placeholder for the automation owner search field",
  },
  loading: {
    defaultMessage: "Loading people",
    id: "DOAMUzw4er",
    description: "Shown while workspace members are loading",
  },
  loadFailed: {
    defaultMessage: "Unable to load people",
    id: "ILxiPF+Jsq",
    description: "Shown when workspace members fail to load",
  },
  empty: {
    defaultMessage: "No people to assign",
    id: "9O2htVwbFg",
    description: "Shown when no assignable workspace operators exist",
  },
  saveSuccess: {
    defaultMessage: "Owner updated",
    id: "Y5QGYzW/72",
    description: "Toast after the automation owner is changed",
  },
  saveFailed: {
    defaultMessage: "Could not update owner",
    id: "6vMOUGk1n4",
    description: "Toast when changing the automation owner fails",
  },
});
