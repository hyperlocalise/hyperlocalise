import { describe, expect, it } from "vitest";

import { tallySanityLocaleProgress } from "./localize-document";

describe("tallySanityLocaleProgress", () => {
  it("splits approved and review segments against the collected total", () => {
    expect(
      tallySanityLocaleProgress(
        [
          { text: "Hello", status: "approved" },
          { text: "Review me", status: "needs_review" },
          { text: "Draft", status: "draft" },
          { text: "", status: "approved" },
        ],
        10,
      ),
    ).toEqual({
      segmentCount: 10,
      approvedCount: 1,
      reviewCount: 2,
    });
  });

  it("uses filled counts when the collected total is unknown", () => {
    expect(
      tallySanityLocaleProgress(
        [
          { text: "Hello", status: "approved" },
          { text: "Review me", status: "needs_review" },
        ],
        0,
      ),
    ).toEqual({
      segmentCount: 2,
      approvedCount: 1,
      reviewCount: 1,
    });
  });
});
