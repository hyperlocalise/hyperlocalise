import { describe, expect, it } from "vite-plus/test";

import { buildFindingId } from "@/lib/providers/provider-job-qa/build-finding-id";
import type { ProviderQaFinding } from "@/lib/providers/provider-job-qa/types";
import { buildHyperlocaliseFindingMarker } from "@/lib/providers/adapters/smartling/smartling-comment-write-back";

import { buildLokaliseCommentWriteBackEntries } from "./lokalise-comment-write-back";

function sampleFinding(overrides?: Partial<ProviderQaFinding>): ProviderQaFinding {
  return {
    checkType: "glossary_violation",
    severity: "error",
    message: "Forbidden term",
    item: {
      externalStringId: "4242",
      key: "welcome.title",
      locale: "fr",
      field: "target",
    },
    ...overrides,
  };
}

describe("buildLokaliseCommentWriteBackEntries", () => {
  it("builds comment payloads with finding markers", () => {
    const finding = sampleFinding();
    const findingId = buildFindingId(finding);

    const result = buildLokaliseCommentWriteBackEntries({
      findings: [finding],
      defaultLocaleId: null,
    });

    expect(result.failures).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      findingId,
      request: {
        keyId: 4242,
        locale: "fr",
        comment: expect.stringContaining(buildHyperlocaliseFindingMarker(findingId)),
      },
    });
  });

  it("records validation failures for missing key ids", () => {
    const finding = sampleFinding({
      item: {
        externalStringId: "",
        key: "welcome.title",
        locale: "fr",
        field: "target",
      },
    });

    const result = buildLokaliseCommentWriteBackEntries({
      findings: [finding],
      defaultLocaleId: "fr",
    });

    expect(result.entries).toEqual([]);
    expect(result.failures[0]?.message).toBe("lokalise_comment_missing_key_id");
  });
});
