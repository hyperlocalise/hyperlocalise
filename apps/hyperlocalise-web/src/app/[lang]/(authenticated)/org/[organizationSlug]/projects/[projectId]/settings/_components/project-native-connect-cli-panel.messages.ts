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

export const projectNativeConnectCliPanelMessages = defineMessages({
  title: {
    defaultMessage: "Connect CLI & CI",
    id: "04TH5FBW4Q",
    description: "Heading for the native project CLI and CI connection panel",
  },
  description: {
    defaultMessage:
      "Use native sync to push source files and pull translations without creating jobs from the CLI.",
    id: "61v3qyuVPR",
    description: "Description for the native project CLI and CI connection panel",
  },
  projectIdLabel: {
    defaultMessage: "Project ID",
    id: "sCRcGCSbrv",
    description: "Label above the copyable native project ID",
  },
  copied: {
    defaultMessage: "Copied",
    id: "nzwZ/Y5WaF",
    description: "Button label after a value was copied to the clipboard",
  },
  copy: {
    defaultMessage: "Copy",
    id: "Q/9NNd2AHJ",
    description: "Button to copy the native project ID",
  },
  sampleConfigLabel: {
    defaultMessage: "Sample i18n.yml",
    id: "JqZe/Pxka2",
    description: "Label above the sample native project i18n.yml config",
  },
  copyConfig: {
    defaultMessage: "Copy config",
    id: "xCCfcveAax",
    description: "Button to copy the sample i18n.yml config",
  },
  syncPushDocs: {
    defaultMessage: "sync push docs",
    id: "B3vlmNRWNz",
    description: "Link to sync push documentation from the native project settings panel",
  },
  syncPullDocs: {
    defaultMessage: "sync pull docs",
    id: "XvnWp/L4sW",
    description: "Link to sync pull documentation from the native project settings panel",
  },
  apiKeys: {
    defaultMessage: "API keys",
    id: "BpWRJW/l3A",
    description: "Link to workspace API keys from the native project settings panel",
  },
});
