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

  it("falls back to the original filename when metadata.title is missing", () => {
    const job = createNativeJobDetail({
      inputPayload: {
        sourceFileId: "file_3b017712-ec57-448f-8015-ca282a5a103a",
        sourceLocale: "en",
        targetLocales: ["fr-FR"],
        fileFormat: "json",
      },
      sourceFilename: "messages.json",
      sourcePath: "marketing/messages.json",
    });

    const layout = jobDetailTaskLayoutFromRecord(job, intl);

    expect(layout.title).toBe("marketing/messages.json");
    expect(layout.input.sourceFilesMetric).toBe("marketing/messages.json");
  });

  it("does not use a stored file id as the attached filename", () => {
    const job = createNativeJobDetail({
      inputPayload: {
        sourceFileId: "file_3b017712-ec57-448f-8015-ca282a5a103a",
        sourceLocale: "en",
        targetLocales: ["fr-FR"],
        fileFormat: "json",
      },
    });

    const layout = jobDetailTaskLayoutFromRecord(job, intl);

    expect(layout.title).toBe("file");
    expect(layout.input.sourceFilesMetric).toBe("file");
  });

  it("keeps a React assignee summary instead of joining every name", () => {
    const job = createNativeJobDetail({
      externalAssignedUsers: ["Malena", "Freya", "karina", "Giang", "Natalia"],
    });

    const layout = jobDetailTaskLayoutFromRecord(job, intl);
    const assignees = layout.properties.find((property) => property.id === "assignees");

    expect(assignees?.value).not.toBe("Malena, Freya, karina, Giang, Natalia");
    expect(assignees?.value).not.toBeNull();
    expect(typeof assignees?.value).toBe("object");
  });
});
