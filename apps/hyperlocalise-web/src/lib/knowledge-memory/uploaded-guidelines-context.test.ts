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
    { id: "doc:french", revisionId: "rev:french", version: 1, title: "French style", locale: "fr-FR", mandatory: false },
    { id: "doc:brand", revisionId: "rev:brand", version: 1, title: "Brand guide", mandatory: true, content: "Never translate Acme." },
  ],
  passages: [
    { id: "p1", documentId: "doc:french", text: "Use vous." },
    { id: "p2", documentId: "doc:french", text: "Keep sentences short." },
  ],
  searchAvailable: true,
};

describe("formatUploadedGuidelines", () => {
  it("puts mandatory documents first and groups passages by document", () => {
    expect(formatUploadedGuidelines(result)).toEqual({
      text: [
        "### Brand guide\nNever translate Acme.",
        "### French style (fr-FR only)\nUse vous.\n\nKeep sentences short.",
      ].join("\n\n"),
      includedDocumentIds: ["doc:brand", "doc:french"],
      omittedMandatoryDocumentIds: [],
    });
  });

  it("truncates passages to the budget and drops sections that no longer fit", () => {
    const long: GuidelineRetrieveResult = {
      documents: [
        { id: "doc:french", revisionId: "rev:french", version: 1, title: "French style", mandatory: false },
        { id: "doc:german", revisionId: "rev:german", version: 1, title: "German style", mandatory: false },
      ],
      passages: [
        { id: "p1", documentId: "doc:french", text: "a".repeat(1_000) },
        { id: "p2", documentId: "doc:german", text: "Use Sie." },
      ],
      searchAvailable: true,
    };
    const formatted = formatUploadedGuidelines(long, 500);
    expect(formatted.text.length).toBeLessThanOrEqual(500);
    expect(formatted.text.startsWith("### French style\n")).toBe(true);
    expect(formatted.text.endsWith("...")).toBe(true);
    expect(formatted.text).not.toContain("German style");
  });

  it("omits a mandatory document that does not fit instead of truncating it", () => {
    const oversized: GuidelineRetrieveResult = {
      ...result,
      documents: [
        { id: "doc:huge", revisionId: "rev:huge", version: 1, title: "Huge rules", mandatory: true, content: "a".repeat(1_000) },
        ...result.documents,
      ],
    };
    const formatted = formatUploadedGuidelines(oversized, 500);
    expect(formatted.omittedMandatoryDocumentIds).toEqual(["doc:huge"]);
    expect(formatted.text.length).toBeLessThanOrEqual(500);
    expect(formatted.text).not.toContain("Huge rules");
    expect(formatted.text).not.toContain("aaa");
    expect(formatted.text.startsWith("### Brand guide\nNever translate Acme.\n\n")).toBe(true);
    expect(formatted.text).toContain("1 mandatory guideline document(s) did not fit");
    expect(formatted.text).toContain("### French style (fr-FR only)");
  });

  it("reports every mandatory document left out of a set that does not fit together", () => {
    const set: GuidelineRetrieveResult = {
      documents: [
        { id: "doc:one", revisionId: "rev:one", version: 1, title: "One", mandatory: true, content: "a".repeat(300) },
        { id: "doc:two", revisionId: "rev:two", version: 1, title: "Two", mandatory: true, content: "b".repeat(300) },
      ],
      passages: [],
      searchAvailable: true,
    };
    const formatted = formatUploadedGuidelines(set, 500);
    expect(formatted.omittedMandatoryDocumentIds).toEqual(["doc:two"]);
    expect(formatted.text).toContain(`### One\n${"a".repeat(300)}`);
    expect(formatted.text).not.toContain("bbb");
    expect(formatted.text.length).toBeLessThanOrEqual(500);
  });

  it("skips documents without text", () => {
    expect(
      formatUploadedGuidelines({
        documents: [{ id: "doc:empty", revisionId: "rev:empty", version: 1, title: "Empty", mandatory: false }],
        passages: [],
        searchAvailable: false,
      }),
    ).toEqual({ text: "", includedDocumentIds: [], omittedMandatoryDocumentIds: [] });
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
    const context = await loadUploadedGuidelinesContext(input, retrieve);
    expect(context.text).toContain("Never translate Acme.");
    expect(context.documents).toEqual([
      {
        documentId: "doc:brand",
        revisionId: "rev:brand",
        version: 1,
        title: "Brand guide",
        mandatory: true,
      },
      {
        documentId: "doc:french",
        revisionId: "rev:french",
        version: 1,
        title: "French style",
        mandatory: false,
        locale: "fr-FR",
      },
    ]);
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

  it("warns when mandatory documents are omitted from the budget", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const retrieve = vi.fn(async () => ({
      ...result,
      documents: [
        { id: "doc:huge", revisionId: "rev:huge", version: 1, title: "Huge", mandatory: true, content: "a".repeat(10_000) },
        ...result.documents,
      ],
    }));
    const context = await loadUploadedGuidelinesContext(input, retrieve);
    expect(context.text).toContain("Never translate Acme.");
    expect(context.text).toContain("did not fit the context budget");
    expect(context.documents).toContainEqual(
      expect.objectContaining({ documentId: "doc:huge", omitted: true }),
    );
    expect(warn).toHaveBeenCalledWith(
      "[translation-context] mandatory uploaded guidelines exceed context budget",
      expect.objectContaining({ omittedDocumentIds: ["doc:huge"] }),
    );
    warn.mockRestore();
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
    await expect(loadUploadedGuidelinesContext(input, retrieve)).resolves.toEqual({
      text: "",
      documents: [],
    });
    expect(warn).toHaveBeenCalledWith(
      "[translation-context] uploaded guideline retrieval failed",
      expect.objectContaining({ code: "guideline_retrieve_failed", status: 503 }),
    );
    warn.mockRestore();
  });
});
