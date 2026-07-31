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
import { createIntl, createIntlCache } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import { createNativeJobDetail } from "./job-detail.fixture";
import { jobDetailTaskLayoutFromRecord } from "./job-detail-layout-helpers";

const intl = createIntl({ locale: "en-US", messages: {} }, createIntlCache());

describe("jobDetailTaskLayoutFromRecord", () => {
  it("prefers metadata.title over sourceFileId for native job titles", () => {
    const job = createNativeJobDetail({
      inputPayload: {
        sourceFileId: "file_abc123",
        sourceLocale: "en",
        targetLocales: ["fr-FR"],
        fileFormat: "json",
        metadata: { title: "messages.json · 2026-07-31 22:11" },
      },
    });

    const layout = jobDetailTaskLayoutFromRecord(job, intl);

    expect(layout.title).toBe("messages.json · 2026-07-31 22:11");
  });

  it("falls back to sourceFileId when metadata.title is missing", () => {
    const job = createNativeJobDetail({
      inputPayload: {
        sourceFileId: "file_abc123",
        sourceLocale: "en",
        targetLocales: ["fr-FR"],
        fileFormat: "json",
      },
    });

    const layout = jobDetailTaskLayoutFromRecord(job, intl);

    expect(layout.title).toBe("file_abc123");
  });
});
