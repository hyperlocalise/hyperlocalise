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
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ContentEditorTestProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import { ContentEditorVideoWorkspace, videoFrameEndpoint } from "./content-editor-video-workspace";
import { ContentEditorFileViewPanel } from "./content-editor-file-view-panel";
import { createCatVideoFileWorkspaceState } from "./content-editor-file-view.fixture";

const sourceSrc = "/api/orgs/test/projects/project-1/assets/file-1";
function show(overrides: Partial<React.ComponentProps<typeof ContentEditorVideoWorkspace>> = {}) {
  const props = {
    sourceSrc,
    targetSrc: "/translated.mp4",
    sourceLocale: "en",
    targetLocale: "fr",
    sourcePaneVisible: false,
    canEdit: true,
    isBusy: false,
    isLoading: false,
    actions: null,
    onDirtyChange: vi.fn(),
    onRegenerate: vi.fn(async () => {}),
    ...overrides,
  };
  return {
    ...render(
      <ContentEditorTestProviders>
        <ContentEditorVideoWorkspace {...props} />
      </ContentEditorTestProviders>,
    ),
    props,
  };
}
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("video refinement workspace", () => {
  it("only enables extraction endpoints on same-origin project assets", () => {
    expect(videoFrameEndpoint(sourceSrc, "https://app.test")).toBe(`${sourceSrc}/frame-text`);
    expect(videoFrameEndpoint("https://elsewhere.test" + sourceSrc, "https://app.test")).toBeNull();
    expect(videoFrameEndpoint("/api/public/media/file", "https://app.test")).toBeNull();
  });
  it("retains refinements after failure and marks them applied only after a successful retry", async () => {
    const user = userEvent.setup();
    const onRegenerate = vi
      .fn()
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValueOnce(undefined);
    const { props } = show({ onRegenerate });
    await user.type(screen.getByLabelText("Voice & pacing"), "Warm and unhurried");
    await waitFor(() => expect(props.onDirtyChange).toHaveBeenLastCalledWith(true));
    await user.click(screen.getByRole("button", { name: "Generate new version" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Generation failed");
    expect(screen.getByLabelText("Voice & pacing")).toHaveValue("Warm and unhurried");
    await user.click(screen.getByRole("button", { name: "Generate new version" }));
    await waitFor(() => expect(props.onDirtyChange).toHaveBeenLastCalledWith(false));
    expect(onRegenerate).toHaveBeenLastCalledWith({
      instructions: expect.stringContaining("Warm and unhurried"),
    });
  });
  it("adds a timestamped element and sends exact replacements to generation", async () => {
    const user = userEvent.setup();
    const { container, props } = show();
    const source = container.querySelector("video")!;
    Object.defineProperties(source, {
      duration: { configurable: true, value: 12 },
      readyState: { configurable: true, value: 2 },
    });
    fireEvent.loadedMetadata(source);
    fireEvent.change(screen.getByRole("slider", { name: "Video playhead" }), {
      target: { value: "3.5" },
    });
    await user.click(screen.getByRole("tab", { name: "On-screen text" }));
    await user.click(screen.getByRole("button", { name: "Add text manually" }));
    await user.type(screen.getByLabelText("Original text"), "Welcome");
    await user.type(screen.getByLabelText("Exact replacement (fr)"), "Bienvenue");
    await user.click(screen.getByRole("button", { name: "Generate new version" }));
    expect(props.onRegenerate).toHaveBeenCalledWith({
      instructions: expect.stringContaining(
        '"timestamp":3.5,"text":"Welcome","replacement":"Bienvenue"',
      ),
    });
    fireEvent.change(screen.getByRole("slider", { name: "Video playhead" }), {
      target: { value: "8" },
    });
    await user.click(screen.getByRole("button", { name: "Text element 1, At 00:03.5" }));
    expect(screen.getByRole("slider", { name: "Video playhead" })).toHaveValue("3.5");
  });
  it("extracts the original frame and retains existing elements when extraction fails", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          frameText: {
            timestamp: 0,
            regions: [
              {
                id: "r",
                text: "Hello",
                bounds: { x: 0.1, y: 0.1, width: 0.4, height: 0.2 },
                translations: {},
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(Response.json({ error: "failed" }, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,AAAA",
    );
    const { container } = show();
    const source = container.querySelector("video")!;
    Object.defineProperties(source, {
      duration: { configurable: true, value: 12 },
      readyState: { configurable: true, value: 2 },
      videoWidth: { configurable: true, value: 1920 },
      videoHeight: { configurable: true, value: 1080 },
    });
    fireEvent.loadedMetadata(source);
    fireEvent.loadedData(source);
    await user.click(screen.getByRole("tab", { name: "On-screen text" }));
    await user.click(screen.getByRole("button", { name: "Extract text at playhead" }));
    expect(await screen.findByLabelText("Original text")).toHaveValue("Hello");
    expect(fetchMock).toHaveBeenCalledWith(
      `${sourceSrc}/frame-text`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ timestamp: 0, frame: "data:image/png;base64,AAAA" }),
      }),
    );
    await user.click(screen.getByRole("button", { name: "Extract text at playhead" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not extract");
    expect(screen.getByLabelText("Original text")).toHaveValue("Hello");
  });
  it("allows read-only playback but disables edits and generation", async () => {
    const user = userEvent.setup();
    show({ canEdit: false });
    expect(screen.getByLabelText("Voice & pacing")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generate new version" })).toBeDisabled();
    await user.click(screen.getByRole("tab", { name: "On-screen text" }));
    expect(screen.getByRole("button", { name: "Add text manually" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Extract text at playhead" })).toBeDisabled();
  });
  it("blocks approval when video directions have not been applied", async () => {
    const user = userEvent.setup();
    const state = createCatVideoFileWorkspaceState();
    render(
      <ContentEditorTestProviders>
        <ContentEditorFileViewPanel
          viewerId="video"
          segment={state.segments![0]}
          onApprove={vi.fn()}
          onRegenerate={vi.fn(async () => {})}
        />
      </ContentEditorTestProviders>,
    );
    const approve = screen.getByRole("button", { name: "Approve" });
    expect(approve).toBeEnabled();
    await user.type(screen.getByLabelText("Music & background"), "Keep the music quiet");
    expect(approve).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Generate new version" }));
    await waitFor(() => expect(approve).toBeEnabled());
  });
});
