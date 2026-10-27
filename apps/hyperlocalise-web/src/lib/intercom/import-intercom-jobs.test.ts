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
  leftoverIntercomJobLocalesNotCoveredByOpenJobs,
  readFileTranslationJobSourceFileId,
  readFileTranslationJobTargetLocales,
  resolveIntercomImportJobTargetLocales,
} from "./import-intercom-jobs";

const mappedJobTargetLocales = ["de-DE", "fr-FR"];

describe("resolveIntercomImportJobTargetLocales", () => {
  it("opens a leftover German job after first ingest seeds French", () => {
    expect(
      resolveIntercomImportJobTargetLocales({
        createJobEnabled: true,
        useProjectTargetLocales: true,
        configuredTargetLocales: [],
        mappedJobTargetLocales,
        importedProjectLocales: ["fr-FR"],
        pushReadyProjectLocales: ["fr-FR"],
        sourceFileId: "file_1",
        openJobs: [],
      }),
    ).toEqual(["de-DE"]);
  });

  it("opens a leftover German job when the English source is unchanged", () => {
    expect(
      resolveIntercomImportJobTargetLocales({
        createJobEnabled: true,
        useProjectTargetLocales: true,
        configuredTargetLocales: [],
        mappedJobTargetLocales,
        importedProjectLocales: [],
        pushReadyProjectLocales: ["fr-FR"],
        sourceUnchanged: true,
        sourceFileId: "file_existing",
        openJobs: [],
      }),
    ).toEqual(["de-DE"]);
  });

  it("reopens push-ready locales for jobs when the English source changed", () => {
    expect(
      resolveIntercomImportJobTargetLocales({
        createJobEnabled: true,
        useProjectTargetLocales: true,
        configuredTargetLocales: [],
        mappedJobTargetLocales,
        importedProjectLocales: [],
        pushReadyProjectLocales: ["fr-FR"],
        sourceUnchanged: false,
        sourceFileId: "file_existing",
        openJobs: [],
      }),
    ).toEqual(["de-DE", "fr-FR"]);
  });

  it("does not open another job when an open job already covers German", () => {
    expect(
      resolveIntercomImportJobTargetLocales({
        createJobEnabled: true,
        useProjectTargetLocales: true,
        configuredTargetLocales: [],
        mappedJobTargetLocales,
        importedProjectLocales: ["fr-FR"],
        pushReadyProjectLocales: ["fr-FR"],
        sourceFileId: "file_1",
        openJobs: [{ sourceFileId: "file_1", targetLocales: ["de-DE"] }],
      }),
    ).toEqual([]);
  });

  it("does not create a job without a source file id", () => {
    expect(
      resolveIntercomImportJobTargetLocales({
        createJobEnabled: true,
        useProjectTargetLocales: true,
        configuredTargetLocales: [],
        mappedJobTargetLocales,
        importedProjectLocales: [],
        pushReadyProjectLocales: [],
        sourceFileId: null,
        openJobs: [],
      }),
    ).toEqual([]);
  });
});

describe("leftoverIntercomJobLocalesNotCoveredByOpenJobs", () => {
  it("ignores open jobs for a different source file", () => {
    expect(
      leftoverIntercomJobLocalesNotCoveredByOpenJobs({
        leftoverLocales: ["de-DE"],
        sourceFileId: "file_1",
        openJobs: [{ sourceFileId: "file_other", targetLocales: ["de-DE"] }],
      }),
    ).toEqual(["de-DE"]);
  });
});

describe("file translation job payload readers", () => {
  it("reads the source file and target locales from a job payload", () => {
    const payload = { sourceFileId: "file_1", targetLocales: ["de-DE", "fr-FR"] };
    expect(readFileTranslationJobSourceFileId(payload)).toBe("file_1");
    expect(readFileTranslationJobTargetLocales(payload)).toEqual(["de-DE", "fr-FR"]);
  });
});
