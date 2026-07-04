// @vitest-environment happy-dom

import { screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { renderWithCatProviders } from "@/components/cat/shared/cat-test-utils";

import { QueueStatusDot } from "./cat-segment-status";

describe("QueueStatusDot", () => {
  it("uses yellow for segments that need review", () => {
    renderWithCatProviders(<QueueStatusDot status="needs_review" />);

    expect(screen.getByRole("img", { name: /Needs review/i })).toHaveClass("bg-beam-700");
  });
});
