"use client";

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
