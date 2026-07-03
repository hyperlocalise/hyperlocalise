import { describe, expect, it } from "vite-plus/test";

import {
  buildCatSegmentShareUrl,
  catSegmentShareParam,
  readCatSegmentShareParam,
} from "./cat-segment-share-link";

describe("cat segment share link", () => {
  it("builds a share URL using the segment key when available", () => {
    const url = buildCatSegmentShareUrl({
      baseUrl: "https://example.com/strings?sourcePath=messages.json&targetLocale=vi",
      segmentId: "seg-42",
      segmentKey: "review.bulk.approve",
    });

    expect(url).toContain(`${catSegmentShareParam}=review.bulk.approve`);
  });

  it("reads the segment share param from search params", () => {
    const params = new URLSearchParams("segment=review.bulk.skip&targetLocale=vi");
    expect(readCatSegmentShareParam(params)).toBe("review.bulk.skip");
  });
});
