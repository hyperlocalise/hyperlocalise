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

export const uploadDropzoneMessages = defineMessages({
  idle: {
    defaultMessage: "Drag a file here",
    id: "zTWXM5pXic",
    description: "Idle label for the upload dropzone",
  },
  drop: {
    defaultMessage: "Drop to upload",
    id: "VMGIdjEtsb",
    description: "Hover label when a file is held over the upload dropzone",
  },
  hint: {
    defaultMessage: "Up to {limit} MB",
    id: "TetVaq6KyH",
    description: "Size limit shown under the upload dropzone idle label",
  },
  tooBig: {
    defaultMessage: "Too big — up to {limit} MB",
    id: "MQNIBdgdfw",
    description: "First refusal when a dropped file is over the upload size limit",
  },
  invalidType: {
    defaultMessage: "This file type is not accepted",
    id: "EengjCh/Fw",
    description: "Refusal when a dropped file is not an accepted type",
  },
  failed: {
    defaultMessage: "Upload failed",
    id: "JJzY5hqU50",
    description: "Refusal when an upload request fails",
  },
  uploaded: {
    defaultMessage: "Uploaded",
    id: "MR9MlnsLWx",
    description: "Status shown after a file finishes uploading in the dropzone",
  },
  meta: {
    defaultMessage: "{size} · {status}",
    id: "M9V2VrtBJl",
    description: "File size and upload status shown inside the dropzone",
  },
  sizeMb: {
    defaultMessage: "{size} MB",
    id: "kWAH9jMxtY",
    description: "File size in megabytes shown on an upload dropzone file",
  },
  sizeKb: {
    defaultMessage: "{size} KB",
    id: "MvjWqs3oAQ",
    description: "File size in kilobytes shown on an upload dropzone file",
  },
  percentMark: {
    defaultMessage: "%",
    id: "CZxzXB0LJr",
    description: "Percent sign after the rolling upload progress digits",
  },
});
