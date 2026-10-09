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
import { describe, expect, it } from "vite-plus/test";

import {
  intercomArticleImportOutcome,
  resolveIntercomSourceIngestAction,
} from "./import-intercom-articles";

describe("resolveIntercomSourceIngestAction", () => {
  it("reuses an ingested source only when the content hash still matches", () => {
    expect(
      resolveIntercomSourceIngestAction({
        sourceContentUnchanged: true,
        latestIngestState: "ingested",
      }),
    ).toBe("reuse");
    expect(
      resolveIntercomSourceIngestAction({
        sourceContentUnchanged: false,
        latestIngestState: "ingested",
      }),
    ).toBe("upload");
  });

  it("waits for a pending ingest instead of marking a failed import active", () => {
    expect(
      resolveIntercomSourceIngestAction({
        sourceContentUnchanged: true,
        latestIngestState: "pending",
      }),
    ).toBe("wait");
  });

  it("re-uploads after a failed ingest so the next import retries", () => {
    expect(
      resolveIntercomSourceIngestAction({
        sourceContentUnchanged: true,
        latestIngestState: "failed",
      }),
    ).toBe("upload");
    expect(
      resolveIntercomSourceIngestAction({
        sourceContentUnchanged: true,
        latestIngestState: null,
      }),
    ).toBe("upload");
  });
});

describe("intercomArticleImportOutcome", () => {
  it("skips only when the source is unchanged and no target locales were written", () => {
    expect(
      intercomArticleImportOutcome({
        sourceUnchanged: true,
        translationsImported: 0,
        translationsFailed: 0,
      }),
    ).toBe("skipped");
  });

  it("counts a source-hash skip as imported when a missing target locale was seeded", () => {
    expect(
      intercomArticleImportOutcome({
        sourceUnchanged: true,
        translationsImported: 1,
        translationsFailed: 0,
      }),
    ).toBe("imported");
  });

  it("counts a source upload as imported even when every target locale is already present", () => {
    expect(
      intercomArticleImportOutcome({
        sourceUnchanged: false,
        translationsImported: 0,
        translationsFailed: 0,
      }),
    ).toBe("imported");
  });

  it("counts translation write failures as failed", () => {
    expect(
      intercomArticleImportOutcome({
        sourceUnchanged: true,
        translationsImported: 0,
        translationsFailed: 2,
      }),
    ).toBe("failed");
    expect(
      intercomArticleImportOutcome({
        sourceUnchanged: false,
        translationsImported: 1,
        translationsFailed: 1,
      }),
    ).toBe("failed");
  });
});
