// @vitest-environment happy-dom

import { screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { renderWithCatProviders } from "@/components/cat/shared/cat-test-utils";

import { QueueStatusDot, SegmentStatusBadge } from "./cat-segment-status";

describe("QueueStatusDot", () => {
  it("uses yellow for segments that need review", () => {
    renderWithCatProviders(<QueueStatusDot status="needs_review" />);

    expect(screen.getByRole("img", { name: /Needs review/i })).toHaveClass("bg-beam-700");
  });
});

describe("SegmentStatusBadge", () => {
  it("uses yellow for segments that need review", () => {
    renderWithCatProviders(<SegmentStatusBadge status="needs_review" />);

    expect(screen.getByText("Needs review")).toHaveClass("text-warning-foreground");
  });

  it("uses plain outline styling for untranslated segments", () => {
    renderWithCatProviders(<SegmentStatusBadge status="pending" />);

    const badge = screen.getByText("Untranslated");
    expect(badge).toHaveClass("text-foreground");
    expect(badge).not.toHaveClass("text-dew-100");
  });
});
