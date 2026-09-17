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

export const translationMemoriesPageContentMessages = defineMessages({
  loadProjectsFailed: {
    defaultMessage: "Failed to load projects",
    id: "bWH4AOzvwJ",
    description: "Fallback error when projects fail to load on the translation memories page",
  },
  loadCredentialsFailed: {
    defaultMessage: "Failed to load provider credentials ({status})",
    id: "3BQQgDQPHy",
    description: "Error when TMS provider credentials fail to load",
  },
  loadProviderMemoriesFailed: {
    defaultMessage: "Failed to load provider translation memories ({status})",
    id: "ej+FsoZqXe",
    description: "Error when live provider translation memories fail to load",
  },
  loadMemoriesFailed: {
    defaultMessage: "Failed to load translation memories ({status})",
    id: "QIfhx7Pg8A",
    description: "Error when workspace translation memories fail to load",
  },
  createMemoryFailed: {
    defaultMessage: "Unable to create translation memory",
    id: "2AHzit242a",
    description: "Fallback error when creating a translation memory fails",
  },
  memoryCreated: {
    defaultMessage: "Translation memory created",
    id: "xZLc+H/X20",
    description: "Toast after a translation memory is created successfully",
  },
  memoryCreatedAndImported: {
    defaultMessage: "Translation memory created. Import started.",
    id: "t4Kq8nWm2P",
    description: "Toast after a translation memory is created and a TMX or CSV import starts",
  },
  importAfterCreateFailed: {
    defaultMessage: "Translation memory created, but the file could not be imported.",
    id: "b7Hs3pLc9R",
    description: "Toast when memory creation succeeds but the follow-up TMX or CSV import fails",
  },
  nameRequired: {
    defaultMessage: "Translation memory name is required.",
    id: "p+mx30+l3M",
    description: "Validation error when the create translation memory name field is empty",
  },
  importFileInvalid: {
    defaultMessage: "Choose a TMX or CSV file.",
    id: "m5Vd2qYn8T",
    description: "Validation error when the create-memory upload is not TMX or CSV",
  },
  importFileTooLarge: {
    defaultMessage:
      "This file is larger than the {maxMegabytes, number} MB import limit. Split the memory into smaller TMX files.",
    id: "h9Wp4sKc1L",
    description: "Error when a create-memory upload exceeds the documented size limit",
  },
});
