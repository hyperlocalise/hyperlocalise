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

import type { ContentEditorFormatCheck } from "@/components/content-editor/shared/types";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import { GoSvcClientError } from "@/lib/go-svc/go-svc-request";

import {
  fetchEditorGuidelineChecks,
  fetchEditorGuidelineExplain,
  guidelineCheckNeedsExplain,
  guidelineFormatChecks,
  mergeGuidelineFormatChecks,
  qaSaveBlockingChecks,
  replaceGuidelineFormatCheck,
} from "./content-editor-guideline-checks";

const lengthCheck: ContentEditorFormatCheck = {
  id: "length",
  label: "Length",
  status: "pass",
  message: "ok",
};

describe("guidelineFormatChecks", () => {
  it("maps a target quote and suggestion to a warning the editor can fix", () => {
    expect(
      guidelineFormatChecks({
        label: "Guideline",
        targetText: "Peux-tu aider ?",
        targetLocale: "fr-FR",
        result: {
          findings: [
            {
              segmentId: "s1",
              field: "target",
              severity: "error",
              start: 5,
              end: 7,
              message: "Use the formal vous.",
              suggestion: "vous",
              passageId: "p1",
            },
          ],
        },
      }),
    ).toEqual([
      {
        id: "guideline-0",
        label: "Guideline",
        status: "warn",
        category: "qa",
        message: "Use the formal vous. Suggestion: vous",
        relatedTokens: ["tu", "vous"],
        appliesToText: "Peux-tu aider ?",
        appliesToLocale: "fr-FR",
        passageId: "p1",
      },
    ]);
  });

  it("keeps classifier rows explainable until Luna writes a suggestion", () => {
    const [check] = guidelineFormatChecks({
      label: "Guideline",
      targetText: "Peux-tu aider ?",
      targetLocale: "fr-FR",
      result: {
        findings: [
          {
            segmentId: "s1",
            field: "target",
            severity: "warning",
            start: 0,
            end: 15,
            message: "This text may not match a project guideline.",
            passageId: "p1",
            reasoningAvailable: true,
          },
        ],
      },
    });
    expect(check).toMatchObject({
      id: "guideline-0",
      message: "This text may not match a project guideline.",
      passageId: "p1",
      reasoningAvailable: true,
    });
    expect(guidelineCheckNeedsExplain(check!)).toBe(true);
    expect(
      guidelineCheckNeedsExplain({
        id: "guideline-0",
        label: "Guideline",
        status: "warn",
        message: "Use vous.",
        passageId: "p1",
      }),
    ).toBe(false);
  });

  it("maps an error severity to a save-blocking finding", () => {
    expect(
      guidelineFormatChecks({
        label: "Guideline",
        targetText: "Use tu here",
        targetLocale: "fr-FR",
        severity: "error",
        result: {
          findings: [
            {
              segmentId: "s1",
              field: "target",
              severity: "error",
              start: 4,
              end: 6,
              message: "Use the formal vous.",
              suggestion: "vous",
              passageId: "p1",
            },
          ],
        },
      })[0],
    ).toMatchObject({ id: "guideline-0", status: "fail" });
  });

  it("does not highlight an omission that spans the whole translation", () => {
    expect(
      guidelineFormatChecks({
        label: "Guideline",
        targetText: "Hello",
        targetLocale: "en",
        result: {
          findings: [
            {
              segmentId: "s1",
              field: "target",
              severity: "info",
              start: 0,
              end: 5,
              message: "Add the product name.",
              passageId: "p1",
            },
          ],
        },
      }),
    ).toEqual([
      {
        id: "guideline-0",
        label: "Guideline",
        status: "warn",
        category: "qa",
        message: "Add the product name.",
        appliesToText: "Hello",
        appliesToLocale: "en",
        passageId: "p1",
      },
    ]);
  });
});

describe("replaceGuidelineFormatCheck", () => {
  it("swaps the classifier row for the explained finding", () => {
    const length: ContentEditorFormatCheck = {
      id: "length",
      label: "Length",
      status: "pass",
      message: "ok",
    };
    const classifier: ContentEditorFormatCheck = {
      id: "guideline-0",
      label: "Guideline",
      status: "warn",
      message: "This text may not match a project guideline.",
      reasoningAvailable: true,
      passageId: "p1",
    };
    const explained: ContentEditorFormatCheck = {
      id: "guideline-0",
      label: "Guideline",
      status: "warn",
      message: "Use the formal vous. Suggestion: vous",
      relatedTokens: ["tu", "vous"],
      passageId: "p1",
    };

    expect(replaceGuidelineFormatCheck([length, classifier], "guideline-0", [explained])).toEqual([
      length,
      explained,
    ]);
  });

  it("keeps the classifier row when Luna returns nothing", () => {
    const classifier: ContentEditorFormatCheck = {
      id: "guideline-0",
      label: "Guideline",
      status: "warn",
      message: "This text may not match a project guideline.",
      reasoningAvailable: true,
      passageId: "p1",
    };
    expect(replaceGuidelineFormatCheck([classifier], "guideline-0", [])).toEqual([classifier]);
  });
});

describe("mergeGuidelineFormatChecks", () => {
  it("replaces guideline rows and keeps the other checks ahead of them", () => {
    const previous: ContentEditorFormatCheck = {
      id: "guideline-0",
      label: "Guideline",
      status: "warn",
      message: "Old",
    };
    const next: ContentEditorFormatCheck = {
      id: "guideline-0",
      label: "Guideline",
      status: "warn",
      message: "New",
    };

    expect(mergeGuidelineFormatChecks([lengthCheck, previous], [next])).toEqual([
      lengthCheck,
      next,
    ]);
  });
});

describe("fetchEditorGuidelineChecks", () => {
  const input = {
    organizationSlug: "acme",
    projectId: "project-1",
    sourceLocale: "en",
    sourceText: "Can you help?",
    targetText: "Peux-tu aider ?",
    targetLocale: "fr-FR",
    segmentId: "s1",
    label: "Guideline",
    limitMessage: "Limit reached",
  };

  it("returns a warning when the check allowance is used up", async () => {
    const client = {
      guidelines: {
        check: vi.fn().mockRejectedValue(
          new GoSvcClientError({
            code: "guideline_check_limit_reached",
            message: "Guideline check limit reached",
            status: 402,
          }),
        ),
      },
    } as unknown as GoSvcClient;

    await expect(fetchEditorGuidelineChecks(input, client)).resolves.toEqual([
      {
        id: "guideline-limit",
        label: "Guideline",
        status: "warn",
        category: "qa",
        message: "Limit reached",
      },
    ]);
  });

  it("adds no row when guideline checks are not configured", async () => {
    const client = {
      guidelines: {
        check: vi.fn().mockRejectedValue(
          new GoSvcClientError({
            code: "guideline_check_unavailable",
            message: "Guideline checks are not configured",
            status: 503,
          }),
        ),
      },
    } as unknown as GoSvcClient;

    await expect(fetchEditorGuidelineChecks(input, client)).resolves.toEqual([]);
  });
});

describe("fetchEditorGuidelineExplain", () => {
  const input = {
    organizationSlug: "acme",
    projectId: "project-1",
    sourceLocale: "en",
    sourceText: "Can you help?",
    targetText: "Peux-tu aider ?",
    targetLocale: "fr-FR",
    segmentId: "s1",
    label: "Guideline",
    checkId: "guideline-0",
    passageId: "p1",
  };

  it("maps Luna findings onto the classifier row id", async () => {
    const explain = vi.fn().mockResolvedValue({
      findings: [
        {
          segmentId: "s1",
          field: "target",
          severity: "warning",
          start: 5,
          end: 7,
          message: "Use the formal vous.",
          suggestion: "vous",
          passageId: "p1",
        },
      ],
      passages: [],
      searchAvailable: true,
      model: "openai/gpt-6-luna",
    });
    const client = { guidelines: { explain } } as unknown as GoSvcClient;

    await expect(fetchEditorGuidelineExplain(input, client)).resolves.toEqual([
      {
        id: "guideline-0",
        label: "Guideline",
        status: "warn",
        category: "qa",
        message: "Use the formal vous. Suggestion: vous",
        relatedTokens: ["tu", "vous"],
        appliesToText: "Peux-tu aider ?",
        appliesToLocale: "fr-FR",
        passageId: "p1",
      },
    ]);
    expect(explain).toHaveBeenCalledWith(
      "acme",
      expect.objectContaining({
        projectId: "project-1",
        passageIds: ["p1"],
        segments: [{ id: "s1", source: "Can you help?", target: "Peux-tu aider ?" }],
      }),
      { signal: undefined },
    );
  });

  it("rethrows used-up AI credit so the editor can toast", async () => {
    const client = {
      guidelines: {
        explain: vi.fn().mockRejectedValue(
          new GoSvcClientError({
            code: "ai_credit_exhausted",
            message: "used up",
            status: 402,
          }),
        ),
      },
    } as unknown as GoSvcClient;

    await expect(fetchEditorGuidelineExplain(input, client)).rejects.toMatchObject({
      code: "ai_credit_exhausted",
      status: 402,
    });
  });

  it("returns no replacement when explain is not configured", async () => {
    const client = {
      guidelines: {
        explain: vi.fn().mockRejectedValue(
          new GoSvcClientError({
            code: "guideline_check_unavailable",
            message: "Guideline checks are not configured",
            status: 503,
          }),
        ),
      },
    } as unknown as GoSvcClient;

    await expect(fetchEditorGuidelineExplain(input, client)).resolves.toEqual([]);
  });

  it("rethrows abort so the editor can ignore a cancelled explain", async () => {
    const client = {
      guidelines: {
        explain: vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")),
      },
    } as unknown as GoSvcClient;

    await expect(fetchEditorGuidelineExplain(input, client)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});

describe("qaSaveBlockingChecks", () => {
  const lengthFailure: ContentEditorFormatCheck = {
    id: "length",
    label: "Length",
    status: "fail",
    message: "Too long",
  };
  const reportedError: ContentEditorFormatCheck = {
    id: "guideline-0",
    label: "Guideline",
    status: "fail",
    message: "Use vous.",
    appliesToText: "Peux-tu aider ?",
    appliesToLocale: "fr-FR",
  };
  const errorPolicy = {
    text: "Peux-tu aider ?",
    locale: "fr-FR",
    guideline: { enabled: true, severity: "error" as const },
  };

  it("blocks on a guideline error the editor already reported for this text and locale", () => {
    expect(
      qaSaveBlockingChecks(
        [lengthFailure],
        [
          reportedError,
          { id: "guideline-limit", label: "Guideline", status: "warn", message: "Limit" },
        ],
        errorPolicy,
      ).map((check) => check.id),
    ).toEqual(["length", "guideline-0"]);
  });

  it("ignores guideline warnings", () => {
    expect(
      qaSaveBlockingChecks(
        [],
        [{ id: "guideline-0", label: "Guideline", status: "warn", message: "Use vous." }],
        errorPolicy,
      ),
    ).toEqual([]);
  });

  it("ignores a guideline error for a different string or locale", () => {
    expect(
      qaSaveBlockingChecks([], [reportedError], { ...errorPolicy, text: "Bonjour" }).map(
        (check) => check.id,
      ),
    ).toEqual([]);
    expect(
      qaSaveBlockingChecks([], [reportedError], { ...errorPolicy, locale: "de" }).map(
        (check) => check.id,
      ),
    ).toEqual([]);
  });

  it("ignores a guideline error when the check is a warning or turned off", () => {
    expect(
      qaSaveBlockingChecks([], [reportedError], {
        ...errorPolicy,
        guideline: { enabled: true, severity: "warning" },
      }),
    ).toEqual([]);
    expect(
      qaSaveBlockingChecks([], [reportedError], {
        ...errorPolicy,
        guideline: { enabled: false, severity: "error" },
      }),
    ).toEqual([]);
  });

  it("ignores a guideline error that has no text or locale stamp", () => {
    expect(
      qaSaveBlockingChecks(
        [],
        [{ id: "guideline-0", label: "Guideline", status: "fail", message: "Use vous." }],
        errorPolicy,
      ),
    ).toEqual([]);
  });
});
