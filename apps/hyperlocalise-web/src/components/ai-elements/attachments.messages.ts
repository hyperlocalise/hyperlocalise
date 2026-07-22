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

export const attachmentsMessages = defineMessages({
  source: {
    id: "Z8vLB9dxFv",

    defaultMessage: "Source",
    description: "Fallback label for a source document attachment without a title",
  },
  image: {
    id: "ilPzVb1cY6",

    defaultMessage: "Image",
    description: "Fallback label and alt text for an image attachment without a filename",
  },
  attachment: {
    id: "iV4M/BRREW",

    defaultMessage: "Attachment",
    description: "Fallback label for a generic file attachment without a filename",
  },
  remove: {
    id: "s3o6M+OdZX",

    defaultMessage: "Remove",
    description: "Accessible label for removing an attachment",
  },
  noAttachments: {
    id: "nmdumlGzfh",

    defaultMessage: "No attachments",
    description: "Empty state when no attachments are present",
  },
});
