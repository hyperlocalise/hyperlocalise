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

export const projectFilesSharedMessages = defineMessages({
  unknownSize: {
    defaultMessage: "Unknown size",
    id: "ch9kNq8+UC",
    description: "Fallback file size label when byte size is unavailable",
  },
  zeroBytes: {
    defaultMessage: "0 B",
    id: "QjCc4wn5VQ",
    description: "File size label when the file is empty",
  },
  byteSize: {
    defaultMessage: "{value} {unit}",
    id: "J9N0QX7lou",
    description: "Formatted file size with a unit abbreviation",
  },
  unitB: {
    defaultMessage: "B",
    id: "j9gPf+HUfJ",
    description: "Byte size unit abbreviation",
  },
  unitKB: {
    defaultMessage: "KB",
    id: "YfmsVkUswA",
    description: "Kilobyte size unit abbreviation",
  },
  unitMB: {
    defaultMessage: "MB",
    id: "tcEBE8+x0p",
    description: "Megabyte size unit abbreviation",
  },
  unitGB: {
    defaultMessage: "GB",
    id: "GWSh8gMiHL",
    description: "Gigabyte size unit abbreviation",
  },
});
