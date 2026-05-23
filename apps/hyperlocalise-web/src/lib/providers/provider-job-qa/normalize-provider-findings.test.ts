import { describe, expect, it } from "vite-plus/test";

import {
  confidenceForHlCheckType,
  confidenceForProviderCheckType,
  normalizeProviderQaFinding,
  normalizeProviderQaFindings,
} from "./normalize-provider-findings";
import type { ProviderQaFinding } from "./types";

const baseFinding: ProviderQaFinding = {
  checkType: "placeholder_mismatch",
  severity: "error",
  message: "Placeholder mismatch",
  item: {
    externalStringId: "1",
    key: "hello",
    locale: "fr",
    field: "target",
  },
};

describe("normalizeProviderQaFinding", () => {
  it("preserves an existing confidence value", () => {
    const normalized = normalizeProviderQaFinding({
      ...baseFinding,
      confidence: 0.42,
    });

    expect(normalized.confidence).toBe(0.42);
  });

  it("assigns hl check confidence when hl source type is provided", () => {
    const normalized = normalizeProviderQaFinding(baseFinding, {
      hlSourceType: "same_as_source",
    });

    expect(normalized.confidence).toBe(0.95);
  });

  it("assigns supplemental check confidence by check type", () => {
    const normalized = normalizeProviderQaFinding({
      ...baseFinding,
      checkType: "length_expansion",
      severity: "warning",
    });

    expect(normalized.confidence).toBe(0.75);
  });
});

describe("normalizeProviderQaFindings", () => {
  it("normalizes every finding in a list", () => {
    const findings = normalizeProviderQaFindings([
      baseFinding,
      {
        ...baseFinding,
        checkType: "glossary_violation",
        confidence: 0.88,
      },
    ]);

    expect(findings[0]?.confidence).toBe(0.9);
    expect(findings[1]?.confidence).toBe(0.88);
  });
});

describe("confidence helpers", () => {
  it("returns deterministic confidence for structural hl checks", () => {
    expect(confidenceForHlCheckType("placeholder_mismatch")).toBe(1);
    expect(confidenceForHlCheckType("icu_shape_mismatch")).toBe(1);
  });

  it("returns heuristic confidence for supplemental checks", () => {
    expect(confidenceForProviderCheckType("stale_unchanged_target")).toBe(0.85);
    expect(confidenceForProviderCheckType("length_expansion")).toBe(0.75);
  });
});
