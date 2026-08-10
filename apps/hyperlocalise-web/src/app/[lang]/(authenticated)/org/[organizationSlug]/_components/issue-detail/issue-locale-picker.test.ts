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
  buildIssueLocaleOptions,
  collectOrganizationIssueLocales,
  resolveIssueCreateLocaleOptions,
  sanitizeIssueCreateTargetLocale,
} from "./issue-locale-picker";

describe("buildIssueLocaleOptions", () => {
  it("dedupes, trims, and sorts project locales", () => {
    expect(buildIssueLocaleOptions([" de-DE ", "fr-FR", "de-DE", ""])).toEqual(["de-DE", "fr-FR"]);
  });

  it("includes the current value even when missing from project locales", () => {
    expect(buildIssueLocaleOptions(["fr-FR"], "ja-JP")).toEqual(["fr-FR", "ja-JP"]);
  });
});

describe("collectOrganizationIssueLocales", () => {
  it("unions target locales across projects", () => {
    expect(
      collectOrganizationIssueLocales([
        { targetLocales: ["fr-FR", "de-DE"] },
        { targetLocales: ["ja-JP", "de-DE"] },
        { targetLocales: null },
        {},
      ]),
    ).toEqual(["de-DE", "fr-FR", "ja-JP"]);
  });
});

describe("resolveIssueCreateLocaleOptions", () => {
  const projects = [
    { id: "web", targetLocales: ["fr-FR", "de-DE"] },
    { id: "mobile", targetLocales: ["ja-JP"] },
  ];

  it("returns the organization union before a project is selected", () => {
    expect(resolveIssueCreateLocaleOptions({ projects })).toEqual(["de-DE", "fr-FR", "ja-JP"]);
  });

  it("scopes locales to the selected project at organization level", () => {
    expect(
      resolveIssueCreateLocaleOptions({
        resolvedProjectId: "mobile",
        projects,
      }),
    ).toEqual(["ja-JP"]);
  });

  it("falls back to fetched project locales when project metadata is missing", () => {
    expect(
      resolveIssueCreateLocaleOptions({
        resolvedProjectId: "mobile",
        projectTargetLocales: ["ja-JP", "ko-KR"],
      }),
    ).toEqual(["ja-JP", "ko-KR"]);
  });
});

describe("sanitizeIssueCreateTargetLocale", () => {
  const projects = [
    { id: "web", targetLocales: ["fr-FR", "de-DE"] },
    { id: "mobile", targetLocales: ["ja-JP"] },
  ];

  it("keeps the locale when it belongs to the selected project", () => {
    expect(
      sanitizeIssueCreateTargetLocale({
        currentLocale: "ja-JP",
        resolvedProjectId: "mobile",
        projects,
      }),
    ).toBe("ja-JP");
  });

  it("clears the locale when it does not belong to the selected project", () => {
    expect(
      sanitizeIssueCreateTargetLocale({
        currentLocale: "fr-FR",
        resolvedProjectId: "mobile",
        projects,
      }),
    ).toBe("");
  });

  it("clears the locale when the selected project has no known locales", () => {
    expect(
      sanitizeIssueCreateTargetLocale({
        currentLocale: "fr-FR",
        resolvedProjectId: "empty",
        projects: [{ id: "empty", targetLocales: [] }],
      }),
    ).toBe("");
  });

  it("keeps the locale while selected project locales are loading", () => {
    expect(
      sanitizeIssueCreateTargetLocale({
        currentLocale: "fr-FR",
        resolvedProjectId: "loading",
        projects: [{ id: "loading", targetLocales: null }],
      }),
    ).toBe("fr-FR");
  });

  it("clears the locale after fetched project locales resolve empty", () => {
    expect(
      sanitizeIssueCreateTargetLocale({
        currentLocale: "fr-FR",
        resolvedProjectId: "loading",
        projects: [{ id: "loading", targetLocales: null }],
        projectTargetLocales: [],
      }),
    ).toBe("");
  });
});
