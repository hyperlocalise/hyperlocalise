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
  calculateFileTranslationMaxPages,
  calculateFileTranslationSandboxTimeoutMs,
  countPendingFileTranslations,
  nextFileTranslationPageDecision,
  parseDeferredByLimit,
} from "./file-translation-pagination";

describe("file translation pagination", () => {
  it("budgets pages from the workload with one recovery page", () => {
    expect(calculateFileTranslationMaxPages(1)).toBe(2);
    expect(calculateFileTranslationMaxPages(500_000)).toBe(5_001);
  });

  it("expands the page ceiling for larger known workloads", () => {
    expect(calculateFileTranslationMaxPages(500_001)).toBe(5_002);
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

describe("nextFileTranslationPageDecision", () => {
  it("continues paging after a partial CLI page so failed keys can resume", () => {
    expect(
      nextFileTranslationPageDecision({
        cliHardFailure: false,
        invalidCount: 0,
        pendingCount: 1,
        acceptedCount: 99,
        deferredByLimit: 0,
        failedCount: 1,
      }),
    ).toBe("continue");
  });

  it("finishes when every pending key was accepted", () => {
    expect(
      nextFileTranslationPageDecision({
        cliHardFailure: false,
        invalidCount: 0,
        pendingCount: 0,
        acceptedCount: 99,
        deferredByLimit: 0,
        failedCount: 1,
      }),
    ).toBe("done");
  });

  it("aborts a hard CLI failure so leftover locales can retry", () => {
    expect(
      nextFileTranslationPageDecision({
        cliHardFailure: true,
        invalidCount: 0,
        pendingCount: 100,
        acceptedCount: 0,
        deferredByLimit: 0,
        failedCount: 1,
      }),
    ).toBe("abort");
  });

  it("aborts a zero-progress page so paging cannot spin forever", () => {
    expect(
      nextFileTranslationPageDecision({
        cliHardFailure: false,
        invalidCount: 0,
        pendingCount: 12,
        acceptedCount: 0,
        deferredByLimit: 0,
        failedCount: 0,
      }),
    ).toBe("abort");
  });

  it("aborts when the sandbox emitted invalid translations", () => {
    expect(
      nextFileTranslationPageDecision({
        cliHardFailure: false,
        invalidCount: 2,
        pendingCount: 8,
        acceptedCount: 4,
        deferredByLimit: 0,
        failedCount: 0,
      }),
    ).toBe("abort");
  });

  it("continues when the page deferred remaining keys by session limit", () => {
    expect(
      nextFileTranslationPageDecision({
        cliHardFailure: false,
        invalidCount: 0,
        pendingCount: 20,
        acceptedCount: 0,
        deferredByLimit: 20,
        failedCount: 0,
      }),
    ).toBe("continue");
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
