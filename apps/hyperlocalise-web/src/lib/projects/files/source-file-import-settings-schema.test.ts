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
  defaultRepositorySourceFileImportSettings,
  importSettingsAreActive,
  normalizeImportSettings,
  repositorySourceFileImportSettingsSchema,
  sourcePathImportKind,
} from "./source-file-import-settings-schema";

describe("repositorySourceFileImportSettingsSchema", () => {
  it("fills empty objects with defaults", () => {
    expect(repositorySourceFileImportSettingsSchema.parse({})).toEqual(
      defaultRepositorySourceFileImportSettings(),
    );
  });

  it("accepts HTML skip tags and ICU sub-filter", () => {
    const parsed = repositorySourceFileImportSettingsSchema.parse({
      html: { excludedElements: [" nav ", "footer"], icuSubfilter: true },
    });
    expect(parsed.html).toEqual({
      excludedElements: ["nav", "footer"],
      icuSubfilter: true,
    });
  });

  it("rejects invalid HTML tag names", () => {
    const result = repositorySourceFileImportSettingsSchema.safeParse({
      html: { excludedElements: ["<script>"] },
    });
    expect(result.success).toBe(false);
  });

  it("accepts JSON key paths, sibling metadata fields, and sub-filters", () => {
    const parsed = repositorySourceFileImportSettingsSchema.parse({
      json: {
        keyPaths: ["messages.*", "*.text"],
        excludeKeyPaths: ["debug.**"],
        contextFields: ["description"],
        characterLimitFields: ["maxLength"],
        htmlSubfilter: true,
        icuSubfilter: true,
      },
    });
    expect(parsed.json.keyPaths).toEqual(["messages.*", "*.text"]);
    expect(parsed.json.contextFields).toEqual(["description"]);
    expect(parsed.json.characterLimitFields).toEqual(["maxLength"]);
    expect(parsed.json.htmlSubfilter).toBe(true);
    expect(parsed.json.icuSubfilter).toBe(true);
  });

  it("accepts 0-based Excel columns including headerless sheets", () => {
    const parsed = repositorySourceFileImportSettingsSchema.parse({
      excel: {
        firstLineContainsHeader: false,
        columns: { identifier: 0, source: 1, context: 2, maxLength: 3 },
      },
    });
    expect(parsed.excel).toEqual({
      firstLineContainsHeader: false,
      columns: { identifier: 0, source: 1, context: 2, maxLength: 3 },
    });
  });

  it("rejects negative Excel column indexes", () => {
    const result = repositorySourceFileImportSettingsSchema.safeParse({
      excel: { columns: { source: -1 } },
    });
    expect(result.success).toBe(false);
  });
});

describe("normalizeImportSettings", () => {
  it("returns defaults for invalid input", () => {
    expect(normalizeImportSettings(null)).toEqual(defaultRepositorySourceFileImportSettings());
    expect(normalizeImportSettings({ html: { excludedElements: ["<bad>"] } } as never)).toEqual(
      defaultRepositorySourceFileImportSettings(),
    );
  });
});

describe("importSettingsAreActive", () => {
  it("is false for defaults and true once any filter is set", () => {
    expect(importSettingsAreActive(defaultRepositorySourceFileImportSettings())).toBe(false);
    expect(
      importSettingsAreActive({
        ...defaultRepositorySourceFileImportSettings(),
        json: {
          ...defaultRepositorySourceFileImportSettings().json,
          keyPaths: ["*.text"],
        },
      }),
    ).toBe(true);
  });
});

describe("sourcePathImportKind", () => {
  it("classifies html, json, and excel paths", () => {
    expect(sourcePathImportKind("pages/home.html")).toBe("html");
    expect(sourcePathImportKind("locales/en.json")).toBe("json");
    expect(sourcePathImportKind("copy/strings.xlsx")).toBe("excel");
    expect(sourcePathImportKind("messages.po")).toBeNull();
  });
});
