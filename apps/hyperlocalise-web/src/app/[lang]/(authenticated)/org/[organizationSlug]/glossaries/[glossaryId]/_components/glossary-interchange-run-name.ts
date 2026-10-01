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
import type { IntlShape } from "react-intl";

import type { GlossaryInterchangeRun } from "@/lib/go-svc/go-svc-client.types";

import { glossaryInterchangeHistoryMessages as messages } from "./glossary-interchange-history.messages";

export function formatGlossaryInterchangeRunName(run: GlossaryInterchangeRun, intl: IntlShape) {
  const filename = (run.operation === "export" ? run.resultFilename : run.sourceFilename)?.trim();
  if (filename) {
    return intl.formatMessage(
      run.operation === "import" ? messages.importRunName : messages.exportRunName,
      { filename },
    );
  }

  return intl.formatMessage(
    run.operation === "import" ? messages.importRunTimestampName : messages.exportRunTimestampName,
    {
      timestamp: intl.formatDate(new Date(run.createdAt), {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    },
  );
}
