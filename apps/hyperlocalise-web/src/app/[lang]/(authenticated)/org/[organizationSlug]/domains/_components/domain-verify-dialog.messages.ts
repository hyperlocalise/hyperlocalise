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

export const domainVerifyDialogMessages = defineMessages({
  title: {
    defaultMessage: "Verify DNS",
    id: "FbWiUTt6DX",
    description: "Verify DNS dialog title",
  },
  description: {
    defaultMessage:
      "Add this TXT record at the DNS host for {domain}. Checking is mocked in this prototype.",
    id: "iCk2jFziPA",
    description: "Verify DNS dialog description",
  },
  hostLabel: {
    defaultMessage: "Host",
    id: "1NNWYQidJ2",
    description: "DNS host label",
  },
  typeLabel: {
    defaultMessage: "Type",
    id: "2UOyOVIi0T",
    description: "DNS record type label",
  },
  valueLabel: {
    defaultMessage: "Value",
    id: "9MIwXNtVoL",
    description: "DNS record value label",
  },
  copyValue: {
    defaultMessage: "Copy value",
    id: "ojrPiYWxu8",
    description: "Copy DNS TXT value",
  },
  check: {
    defaultMessage: "Check now",
    id: "UsyjaZLxwE",
    description: "Run the mocked DNS check",
  },
  success: {
    defaultMessage: "Record found. Research unlocks after verification finishes.",
    id: "OsEkNLI6gz",
    description: "Toast after a mocked DNS check",
  },
});
