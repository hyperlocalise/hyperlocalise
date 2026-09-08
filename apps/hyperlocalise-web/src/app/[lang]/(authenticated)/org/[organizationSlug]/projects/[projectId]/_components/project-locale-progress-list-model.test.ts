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
  buildLocaleEditorHref,
  filterAndSortLocaleProgress,
  localeProgressPercents,
  remainingLocaleWork,
} from "./project-locale-progress-list-model";
import type { ProjectLocaleProgressRow } from "@/api/routes/project/project.schema";

const rows: ProjectLocaleProgressRow[] = [
  {
    locale: "fr-FR",
    translationProgress: 50,
    approvalProgress: 10,
    words: { total: 10, translated: 5, approved: 1 },
    phrases: { total: 4, translated: 2, approved: 1 },
    lastActivityAt: null,
  },
  {
    locale: "de-DE",
    translationProgress: 0,
    approvalProgress: 0,
    words: { total: 10, translated: 0, approved: 0 },
    phrases: { total: 4, translated: 0, approved: 0 },
    lastActivityAt: null,
  },
];

describe("filterAndSortLocaleProgress", () => {
  it("filters by locale code or label and sorts A–Z", () => {
    expect(
      filterAndSortLocaleProgress(rows, {
        query: "german",
        sort: "az",
        getLabel: (locale) => (locale === "de-DE" ? "German (Germany)" : "French (France)"),
      }).map((row) => row.locale),
    ).toEqual(["de-DE"]);

    expect(
      filterAndSortLocaleProgress(rows, {
        query: "",
        sort: "az",
        getLabel: (locale) => (locale === "de-DE" ? "German (Germany)" : "French (France)"),
      }).map((row) => row.locale),
    ).toEqual(["fr-FR", "de-DE"]);
  });
});

describe("remainingLocaleWork", () => {
  it("uses remaining words, then falls back to strings", () => {
    expect(remainingLocaleWork(rows[0]!)).toBe(5);
    expect(
      remainingLocaleWork({
        ...rows[0]!,
        words: { total: 0, translated: 0, approved: 0 },
      }),
    ).toBe(2);
  });
});

describe("localeProgressPercents", () => {
  it("derives percents from the selected words or strings bucket", () => {
    expect(localeProgressPercents(rows[0]!, "words")).toEqual({
      translation: 50,
      approval: 10,
    });
    expect(localeProgressPercents(rows[0]!, "phrases")).toEqual({
      translation: 50,
      approval: 25,
    });
  });
});

describe("buildLocaleEditorHref", () => {
  it("sets locale and queue filter on the strings editor path", () => {
    expect(
      buildLocaleEditorHref({
        stringsHref: "/org/acme/projects/p1/strings",
        locale: "fr-FR",
        queueFilter: "untranslated",
      }),
    ).toBe("/org/acme/projects/p1/strings?locale=fr-FR&queueFilter=untranslated");
  });
});
