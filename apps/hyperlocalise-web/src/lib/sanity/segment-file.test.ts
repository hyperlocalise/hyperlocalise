/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 */
import { describe, expect, it } from "vitest";

import {
  buildSanityDocumentSourcePath,
  isSanityStampSegmentKey,
  parseSanityTranslationFile,
  segmentsToTranslationFile,
} from "./segment-file";

describe("sanity segment-file", () => {
  it("builds document source paths", () => {
    expect(
      buildSanityDocumentSourcePath({
        sanityProjectId: "abc12",
        dataset: "production",
        documentType: "post",
        documentId: "drafts.abc-123",
        documentTitle: "Launch Week",
      }),
    ).toBe("sanity/abc12/production/post/launch-week-abc-123.json");
  });

  it("accepts sanity.k.* keys only", () => {
    expect(isSanityStampSegmentKey("sanity.k.title")).toBe(true);
    expect(isSanityStampSegmentKey("figma.k.title")).toBe(false);
  });

  it("round-trips collect segments", () => {
    const file = segmentsToTranslationFile([
      {
        key: "sanity.k.title",
        documentId: "doc-1",
        documentType: "post",
        text: "  Hello   world  ",
      },
    ]);
    expect(file).toEqual({ "sanity.k.title": "Hello world" });
    expect(parseSanityTranslationFile(file)).toEqual(file);
  });
});
