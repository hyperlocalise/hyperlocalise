/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 */
import { describe, expect, it } from "vite-plus/test";

import { glossaryConceptPageQuerySchema } from "./glossary.schema";

describe("glossary concept page query schema", () => {
  it("parses explicit false boolean query values as false", () => {
    const result = glossaryConceptPageQuerySchema.parse({
      caseSensitive: "false",
      forbidden: "false",
      includeArchived: "false",
    });

    expect(result.caseSensitive).toBe(false);
    expect(result.forbidden).toBe(false);
    expect(result.includeArchived).toBe(false);
  });

  it("keeps concept and term review filters distinct", () => {
    const result = glossaryConceptPageQuerySchema.parse({
      reviewStatus: "approved",
      termReviewStatus: "draft",
    });

    expect(result.reviewStatus).toBe("approved");
    expect(result.termReviewStatus).toBe("draft");
  });

  it("accepts primary-term sort for the source-term column", () => {
    const result = glossaryConceptPageQuerySchema.parse({
      sort: "primary_term",
      sortDir: "asc",
    });

    expect(result.sort).toBe("primary_term");
    expect(result.sortDir).toBe("asc");
  });
});
