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
// @vitest-environment happy-dom

import { screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import {
  QueueStatusDot,
  SegmentStatusBadge,
  shouldShowSegmentStatusBadge,
} from "./content-editor-segment-status";

describe("QueueStatusDot", () => {
  it("uses yellow for segments that need review", () => {
    renderWithContentEditorProviders(<QueueStatusDot status="needs_review" />);

    expect(screen.getByRole("img", { name: /Needs review/i })).toHaveClass("bg-beam-700");
  });
});

describe("shouldShowSegmentStatusBadge", () => {
  it("hides the Untranslated status when the string is hidden", () => {
    expect(shouldShowSegmentStatusBadge("pending", true)).toBe(false);
    expect(shouldShowSegmentStatusBadge("pending", false)).toBe(true);
    expect(shouldShowSegmentStatusBadge("needs_review", true)).toBe(true);
  });
});

describe("SegmentStatusBadge", () => {
  it("uses an amber pill with a dot for segments that need review", () => {
    renderWithContentEditorProviders(<SegmentStatusBadge status="needs_review" />);

    const badge = screen.getByText("Needs review");
    expect(badge).toHaveClass("bg-beam-100", "text-beam-900", "rounded-full");
    expect(badge.querySelector("[aria-hidden]")).toHaveClass("bg-beam-700");
  });

  it("uses a green pill with a dot for approved segments", () => {
    renderWithContentEditorProviders(<SegmentStatusBadge status="reviewed" />);

    const badge = screen.getByText("Approved");
    expect(badge).toHaveClass("bg-grove-100", "text-grove-900");
    expect(badge.querySelector("[aria-hidden]")).toHaveClass("bg-grove-700");
  });

  it("uses a muted pill with a hollow dot for untranslated segments", () => {
    renderWithContentEditorProviders(<SegmentStatusBadge status="pending" />);

    const badge = screen.getByText("Untranslated");
    expect(badge).toHaveClass("bg-muted", "text-muted-foreground");
    expect(badge.querySelector("[aria-hidden]")).toHaveClass("border");
  });
});
