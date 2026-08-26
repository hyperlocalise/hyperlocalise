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
  FILE_TRANSLATION_MAX_SANDBOX_TIMEOUT_MS,
  FILE_TRANSLATION_MAX_TRANSLATIONS_PER_SESSION,
  FILE_TRANSLATION_MIN_PAGES,
  calculateFileTranslationMaxPages,
  calculateFileTranslationSandboxTimeoutMs,
  countPendingFileTranslations,
  parseDeferredByLimit,
} from "./file-translation-pagination";

describe("file translation pagination", () => {
  it("checkpoints after 100 translations", () => {
    expect(FILE_TRANSLATION_MAX_TRANSLATIONS_PER_SESSION).toBe(100);
  });

  it("preserves capacity for 500,000 translations after shrinking pages", () => {
    expect(FILE_TRANSLATION_MIN_PAGES).toBe(5_000);
    expect(calculateFileTranslationMaxPages(500_000)).toBe(5_000);
  });

  it("expands the page ceiling for larger known workloads", () => {
    expect(calculateFileTranslationMaxPages(500_001)).toBe(5_001);
  });

  it("keeps the ten-minute minimum for small workloads", () => {
    expect(calculateFileTranslationSandboxTimeoutMs(10)).toBe(10 * 60 * 1_000);
  });

  it("counts untranslated key-locale pairs after merged prefills", () => {
    expect(
      countPendingFileTranslations({ one: "One", two: "Two", three: "Three" }, ["fr", "de"], {
        fr: { one: "Un" },
        de: { one: "Eins", two: "Zwei" },
      }),
    ).toBe(3);
  });

  it("budgets three seconds per pending key-locale translation plus overhead", () => {
    expect(calculateFileTranslationSandboxTimeoutMs(800)).toBe(42 * 60 * 1_000);
  });

  it("caps the timeout at the sandbox platform maximum", () => {
    expect(calculateFileTranslationSandboxTimeoutMs(1_000_000)).toBe(
      FILE_TRANSLATION_MAX_SANDBOX_TIMEOUT_MS,
    );
  });
});

describe("parseDeferredByLimit", () => {
  it("reads deferred_by_limit from hl run stdout", () => {
    expect(
      parseDeferredByLimit(
        "planned_total=3000 skipped_by_lock=0 executable_total=1000 deferred_by_limit=2000\nsucceeded=1000 failed=0\n",
      ),
    ).toBe(2000);
  });

  it("returns 0 when the marker is absent", () => {
    expect(parseDeferredByLimit("planned_total=1 executable_total=1\n")).toBe(0);
  });

  it("returns 0 for deferred_by_limit=0", () => {
    expect(parseDeferredByLimit("deferred_by_limit=0\n")).toBe(0);
  });
});
