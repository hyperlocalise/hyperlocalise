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

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { ContentEditorTestProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import type { ContentEditorSegment } from "@/components/content-editor/shared/types";

import { ContentEditorOfficeSegmentFieldsPane } from "./content-editor-office-segment-fields-pane";

const OPEN = "\x1eHLOXPH_6F30_0\x1f";
const CLOSE = "\x1eHLOXPH_6330_1\x1f";

function segment(
  id: string,
  key: string,
  sourceText: string,
  targetText = "",
): ContentEditorSegment {
  return {
    id,
    index: 0,
    key,
    sourceText,
    targetText,
    sourceLocale: "en",
    targetLocale: "fr",
    status: "pending",
  };
}

function Harness({
  initial,
  onSaveDrafts,
  failIds = [],
}: {
  initial: ContentEditorSegment[];
  onSaveDrafts: (ids: string[], texts: Record<string, string>) => void;
  failIds?: string[];
}) {
  const [segments, setSegments] = useState(initial);
  const [dirty, setDirty] = useState<ReadonlySet<string>>(new Set());
  return (
    <ContentEditorTestProviders>
      <ContentEditorOfficeSegmentFieldsPane
        segments={segments}
        dirtySegmentIds={dirty}
        canEdit
        hasMore={false}
        onChange={(id, targetText) => {
          setSegments((current) =>
            current.map((entry) => (entry.id === id ? { ...entry, targetText } : entry)),
          );
          setDirty((current) => new Set(current).add(id));
        }}
        onSaveDrafts={async (ids) => {
          onSaveDrafts(
            ids,
            Object.fromEntries(
              segments
                .filter((entry) => ids.includes(entry.id))
                .map((entry) => [entry.id, entry.targetText]),
            ),
          );
          setDirty(new Set(failIds));
        }}
      />
    </ContentEditorTestProviders>
  );
}

describe("ContentEditorOfficeSegmentFieldsPane", () => {
  it("groups fields by slide and saves edits with formatting tokens restored", async () => {
    const onSaveDrafts = vi.fn();
    render(
      <Harness
        onSaveDrafts={onSaveDrafts}
        initial={[
          segment("a", "ppt/slides/slide1.xml#0", "Quarterly review"),
          segment("b", "ppt/slides/slide2.xml#0", `Read the ${OPEN}terms${CLOSE}`),
        ]}
      />,
    );

    expect(screen.getByText("Slide 1")).toBeInTheDocument();
    expect(screen.getByText("Slide 2")).toBeInTheDocument();
    expect(screen.getByText("Read the OX#0termsOX#1")).toBeInTheDocument();

    const fields = screen.getAllByLabelText("Paragraph 1");
    fireEvent.change(fields[1]!, { target: { value: "Lisez les OX#0conditionsOX#1" } });
    await userEvent.click(screen.getByRole("button", { name: "Save 1 draft" }));

    expect(onSaveDrafts).toHaveBeenCalledWith(["b"], {
      b: `Lisez les ${OPEN}conditions${CLOSE}`,
    });
    expect(await screen.findByRole("button", { name: "Save 0 drafts" })).toBeDisabled();
  });

  it("reports fields that are still unsaved after a save", async () => {
    render(
      <Harness
        onSaveDrafts={vi.fn()}
        failIds={["a"]}
        initial={[segment("a", "Prices!B3", "Free trial")]}
      />,
    );

    expect(screen.getByText("Prices")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("B3"), { target: { value: "Essai" } });
    await userEvent.click(screen.getByRole("button", { name: "Save 1 draft" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("1 edit was not saved"),
    );
    expect(screen.getByLabelText("B3")).toHaveAttribute("aria-invalid", "true");
  });
});
