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
import { act } from "react";
import { fireEvent, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import { contentEditorSegmentsFixture } from "@/components/content-editor/shared/content-editor.fixture";
import {
  ContentEditorMultilingualTable,
  type ContentEditorMultilingualConfig,
} from "./content-editor-multilingual-table";

const { targetQuery, retry } = vi.hoisted(() => ({ targetQuery: vi.fn(), retry: vi.fn() }));
vi.mock("@/components/content-editor/project-file/use-content-editor-segment-target", () => ({
  useContentEditorSegmentTarget: targetQuery,
}));
// Supply viewport geometry, retaining the real virtualizer's range calculations.
vi.mock("@tanstack/react-virtual", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-virtual")>();
  return {
    ...actual,
    useVirtualizer: (options: Parameters<typeof actual.useVirtualizer>[0]) =>
      actual.useVirtualizer({
        ...options,
        observeElementRect: (_instance, callback) => {
          callback({ width: 960, height: 320 });
          return () => {};
        },
      }),
  };
});

vi.mock("../editor/content-editor-target-editor", () => ({
  ContentEditorTargetEditor: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string;
    onChange: (text: string) => void;
    ariaLabel: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      autoFocus
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const saveTranslation = vi.fn().mockResolvedValue(undefined);
const config: ContentEditorMultilingualConfig = {
  onSaveTranslation: saveTranslation,
  organizationSlug: "acme",
  projectId: "p1",
  sourcePath: "en.json",
  sourceLocale: "en",
  targetLocales: ["fr", "de", "ja", "ar", "vi", "es", "it", "ko"],
};
const segments = Array.from({ length: 10_000 }, (_, index) => ({
  ...contentEditorSegmentsFixture[0],
  id: `key-${index}`,
  key: `message.${index}`,
  index: index + 1,
  sourceText: `Source ${index}`,
}));
function renderTable(
  overrides: Partial<React.ComponentProps<typeof ContentEditorMultilingualTable>> = {},
) {
  const onOpenTranslation = vi.fn();
  const result = renderWithContentEditorProviders(
    <ContentEditorMultilingualTable
      config={config}
      segments={segments}
      selectedSegmentId="key-0"
      onOpenTranslation={onOpenTranslation}
      {...overrides}
    />,
  );
  return { ...result, onOpenTranslation };
}

beforeEach(() => {
  saveTranslation.mockClear();
  targetQuery.mockReset();
  retry.mockReset();
  targetQuery.mockImplementation((input) => ({
    data: { text: `${input.targetLocale}:${input.externalStringId}`, isApproved: false },
    isPending: false,
    isError: false,
    refetch: retry,
  }));
});
afterEach(cleanup);

describe("multilingual table", () => {
  it("cancels edits and does not save composing Enter or Shift+Enter", async () => {
    renderTable();
    fireEvent.click(await screen.findByRole("button", { name: "Edit message.0 in French" }));
    const editor = await screen.findByRole("textbox", { name: "Edit message.0 in French" });
    fireEvent.change(editor, { target: { value: "draft" } });
    fireEvent.keyDown(editor, { key: "Enter", isComposing: true });
    fireEvent.keyDown(editor, { key: "Enter", shiftKey: true });
    expect(saveTranslation).not.toHaveBeenCalled();
    fireEvent.keyDown(editor, { key: "Escape" });
    expect(saveTranslation).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Edit message.0 in French" })).toHaveTextContent(
      "fr:key-0",
    );
  });

  it("moves between languages with Tab and saves on blur", async () => {
    renderTable();
    fireEvent.click(await screen.findByRole("button", { name: "Edit message.0 in French" }));
    const editor = await screen.findByRole("textbox", { name: "Edit message.0 in French" });
    fireEvent.change(editor, { target: { value: "Bonjour" } });
    fireEvent.keyDown(editor, { key: "Tab" });
    const german = await screen.findByRole("textbox", { name: "Edit message.0 in German" });
    fireEvent.change(german, { target: { value: "Hallo" } });
    fireEvent.blur(german);
    await waitFor(() => expect(saveTranslation).toHaveBeenCalledWith(segments[0], "de", "Hallo"));
  });

  it("does not edit locked cells", async () => {
    renderTable({ segments: [{ ...segments[0], isLocked: true }] });
    expect(await screen.findByRole("button", { name: "Edit message.0 in French" })).toBeDisabled();
  });

  it("bounds mounted rows, columns, and translation subscriptions for 10,000 keys", async () => {
    renderTable();
    await waitFor(() => expect(screen.getAllByRole("row").length).toBeGreaterThan(2));
    expect(screen.getAllByRole("row").length).toBeLessThan(20);
    expect(screen.getAllByRole("columnheader").length).toBeLessThan(
      config.targetLocales.length + 2,
    );
    expect(screen.getByRole("table")).toHaveAttribute("aria-rowcount", "10001");
    const identities = new Set(
      targetQuery.mock.calls.map(([input]) => `${input.targetLocale}:${input.externalStringId}`),
    );
    expect(identities.size).toBeLessThan(60);
    expect(screen.queryByText("message.9999")).not.toBeInTheDocument();
    expect(targetQuery.mock.calls.every(([input]) => input.priority === false)).toBe(true);
  });

  it("edits inline, saves the clicked language, and moves down without opening another view", async () => {
    const { onOpenTranslation } = renderTable({
      config: {
        ...config,
        identities: new Map([
          [
            "key-0",
            { sourcePath: "nested/en.json", externalResourceId: "file-2", resourceType: "file" },
          ],
        ]),
      },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Edit message.0 in French" }));
    expect(onOpenTranslation).not.toHaveBeenCalled();
    const editor = await screen.findByRole("textbox", { name: "Edit message.0 in French" });
    fireEvent.change(editor, { target: { value: "Bonjour" } });
    fireEvent.keyDown(editor, { key: "Enter" });
    await waitFor(() => expect(saveTranslation).toHaveBeenCalledWith(segments[0], "fr", "Bonjour"));
    expect(
      await screen.findByRole("textbox", { name: "Edit message.1 in French" }),
    ).toBeInTheDocument();
    expect(targetQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        externalStringId: "key-0",
        sourcePath: "nested/en.json",
        externalResourceId: "file-2",
        targetLocale: "fr",
      }),
    );
  });

  it("loads new language columns on horizontal scroll without mounting the whole file", async () => {
    renderTable();
    const scroller = screen.getByRole("region", { name: "Multilingual translations" });
    await act(async () => {
      scroller.scrollLeft = 1900;
      fireEvent.scroll(scroller);
    });
    await waitFor(() =>
      expect(targetQuery).toHaveBeenCalledWith(expect.objectContaining({ targetLocale: "it" })),
    );
    expect(screen.getAllByRole("row").length).toBeLessThan(20);
    expect(screen.getByRole("columnheader", { name: "Key" })).toBeInTheDocument();
  });

  it("distinguishes missing translations from failures and allows retry", async () => {
    targetQuery.mockImplementation((input) => ({
      data: input.targetLocale === "fr" ? null : undefined,
      isPending: false,
      isError: input.targetLocale !== "fr",
      refetch: retry,
    }));
    renderTable({ segments: segments.slice(0, 1) });
    expect(await screen.findByText("Not translated")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Retry" })[0]);
    expect(retry).toHaveBeenCalledOnce();
  });

  it("requests the next page once when the visible range reaches the end", async () => {
    const onLoadMore = vi.fn();
    renderTable({ segments: segments.slice(0, 5), hasMore: true, onLoadMore });
    await waitFor(() => expect(onLoadMore).toHaveBeenCalledOnce());
  });

  it("does not request translations while the queue is pending", async () => {
    renderTable({ isLoading: true });
    await waitFor(() => expect(targetQuery).toHaveBeenCalled());
    expect(targetQuery.mock.calls.every(([input]) => input.enabled === false)).toBe(true);
    expect(
      screen.queryByRole("button", { name: "Edit message.0 in French" }),
    ).not.toBeInTheDocument();
  });
});
