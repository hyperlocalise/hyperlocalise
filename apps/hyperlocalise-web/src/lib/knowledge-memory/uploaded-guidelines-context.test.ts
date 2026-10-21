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
import { describe, expect, it, vi } from "vite-plus/test";

import type { GuidelineRetrieveResult } from "@/lib/go-svc/go-svc-guidelines-api";
import { GoSvcClientError } from "@/lib/go-svc/go-svc-request";

import {
  UPLOADED_GUIDELINES_MAX_LOCALES,
  formatUploadedGuidelines,
  loadUploadedGuidelinesContext,
} from "./uploaded-guidelines-context";

const result: GuidelineRetrieveResult = {
  documents: [
    { id: "doc:french", title: "French style", locale: "fr-FR", mandatory: false },
    { id: "doc:brand", title: "Brand guide", mandatory: true, content: "Never translate Acme." },
  ],
  passages: [
    { id: "p1", documentId: "doc:french", text: "Use vous." },
    { id: "p2", documentId: "doc:french", text: "Keep sentences short." },
  ],
  searchAvailable: true,
};

describe("formatUploadedGuidelines", () => {
  it("puts mandatory documents first and groups passages by document", () => {
    expect(formatUploadedGuidelines(result)).toBe(
      [
        "### Brand guide\nNever translate Acme.",
        "### French style (fr-FR only)\nUse vous.\n\nKeep sentences short.",
      ].join("\n\n"),
    );
  });

  it("truncates to the budget and drops sections that no longer fit", () => {
    const long: GuidelineRetrieveResult = {
      ...result,
      documents: [
        { id: "doc:brand", title: "Brand guide", mandatory: true, content: "a".repeat(1_000) },
        ...result.documents.slice(0, 1),
      ],
    };
    const formatted = formatUploadedGuidelines(long, 500);
    expect(formatted.length).toBeLessThanOrEqual(500);
    expect(formatted.startsWith("### Brand guide\n")).toBe(true);
    expect(formatted.endsWith("...")).toBe(true);
    expect(formatted).not.toContain("French style");
  });

  it("skips documents without text", () => {
    expect(
      formatUploadedGuidelines({
        documents: [{ id: "doc:empty", title: "Empty", mandatory: false }],
        passages: [],
        searchAvailable: false,
      }),
    ).toBe("");
  });
});

describe("loadUploadedGuidelinesContext", () => {
  const input = {
    organizationId: "org",
    projectId: "project",
    targetLocales: ["fr-FR"],
    sourceText: "Acme checkout",
  };

  it("retrieves per target locale and formats the result", async () => {
    const retrieve = vi.fn(async () => result);
    await expect(loadUploadedGuidelinesContext(input, retrieve)).resolves.toContain(
      "Never translate Acme.",
    );
    expect(retrieve).toHaveBeenCalledWith(
      "org",
      { projectId: "project", locales: ["fr-FR"], query: "Acme checkout", limit: 8 },
      { signal: expect.any(AbortSignal) },
    );
  });

  it("falls back to locale-independent documents for many target locales", async () => {
    const retrieve = vi.fn(async () => result);
    const targetLocales = Array.from(
      { length: UPLOADED_GUIDELINES_MAX_LOCALES + 1 },
      (_, index) => `x-${index}`,
    );
    await loadUploadedGuidelinesContext({ ...input, targetLocales }, retrieve);
    expect(retrieve).toHaveBeenCalledWith(
      "org",
      expect.objectContaining({ locales: [] }),
      expect.anything(),
    );
  });

  it("returns an empty string when retrieval fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const retrieve = vi.fn(async () => {
      throw new GoSvcClientError({
        code: "guideline_retrieve_failed",
        message: "down",
        status: 503,
      });
    });
    await expect(loadUploadedGuidelinesContext(input, retrieve)).resolves.toBe("");
    expect(warn).toHaveBeenCalledWith(
      "[translation-context] uploaded guideline retrieval failed",
      expect.objectContaining({ code: "guideline_retrieve_failed", status: 503 }),
    );
    warn.mockRestore();
  });
});
