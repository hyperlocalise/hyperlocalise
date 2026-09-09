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
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ContentEditorTestProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import {
  ContentEditorImageWorkspace,
  imageTextLayersEndpoint,
} from "./content-editor-image-workspace";
import type { ImageTextLayers } from "@/lib/projects/files/image-text-layers";

const initialLayers: ImageTextLayers = {
  version: 1,
  sourceHash: "source-hash",
  revision: "00000000-0000-4000-8000-000000000001",
  extractedAt: "2026-09-09T00:00:00.000Z",
  regions: [
    {
      id: "headline",
      text: "A little closer",
      bounds: { x: 0.1, y: 0.2, width: 0.7, height: 0.15 },
      translations: {},
    },
  ],
};
const sourceSrc = "/api/orgs/acme/projects/project_1/assets/file_source";
const baseProps = {
  sourceSrc,
  targetSrc: "/localised.png",
  sourceLocale: "en",
  targetLocale: "fr",
  sourcePaneVisible: false,
  canEdit: true,
  isBusy: false,
  isLoading: false,
  actions: null,
  onDirtyChange: vi.fn(),
};
function show(props = {}) {
  return render(
    <ContentEditorTestProviders>
      <ContentEditorImageWorkspace {...baseProps} {...props} />
    </ContentEditorTestProviders>,
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("image workspace", () => {
  it("limits metadata requests to same-origin project assets", () => {
    expect(imageTextLayersEndpoint(sourceSrc)).toBe(`${sourceSrc}/text-layers`);
    expect(imageTextLayersEndpoint("https://external.example/image.png")).toBeNull();
    expect(imageTextLayersEndpoint("/api/files/file_1")).toBeNull();
  });
  it("extracts text on demand and exposes the saved regions", async () => {
    const fetchMock = vi.fn(async (_url, options) =>
      Response.json({ textLayers: options?.method === "POST" ? initialLayers : null }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Extract text" }));
    expect(await screen.findByLabelText("Source text")).toHaveValue("A little closer");
    expect(fetchMock).toHaveBeenCalledWith(
      `${sourceSrc}/text-layers`,
      expect.objectContaining({ method: "POST" }),
    );
  });
  it("retries failed extraction directly", async () => {
    let extractionAttempts = 0;
    const fetchMock = vi.fn(async (_url, options) => {
      if (options?.method === "POST") {
        extractionAttempts += 1;
        return extractionAttempts === 1
          ? Response.json({ error: "unavailable" }, { status: 503 })
          : Response.json({ textLayers: initialLayers });
      }
      return Response.json({ textLayers: null });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    show();

    await user.click(await screen.findByRole("button", { name: "Extract text" }));
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await screen.findByLabelText("Source text");
    expect(extractionAttempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ method: "POST" }));
    expect(fetchMock.mock.calls[2]?.[1]).toEqual(expect.objectContaining({ method: "POST" }));
  });
  it("saves edited wording before regeneration and preserves the target locale", async () => {
    let savedBody: ImageTextLayers | undefined;
    const steps: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options) => {
        if (options?.method === "PATCH") {
          steps.push("save");
          savedBody = JSON.parse(options.body);
          return Response.json({
            textLayers: { ...savedBody, revision: "00000000-0000-4000-8000-000000000002" },
          });
        }
        return Response.json({ textLayers: initialLayers });
      }),
    );
    const onRegenerate = vi.fn(async () => {
      steps.push("generate");
    });
    const user = userEvent.setup();
    show({ onRegenerate });
    await user.type(await screen.findByLabelText("Exact replacement (fr)"), "Plus près");
    await user.click(screen.getByRole("button", { name: "Save & regenerate" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Uses 1 text layer/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Save & regenerate" }));
    await waitFor(() => expect(onRegenerate).toHaveBeenCalledTimes(1));
    expect(steps).toEqual(["save", "generate"]);
    expect(savedBody?.regions[0].translations.fr.text).toBe("Plus près");
  });
  it("does not generate after a failed save and retains edits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options) =>
        options?.method === "PATCH"
          ? Response.json({ error: "unavailable" }, { status: 503 })
          : Response.json({ textLayers: initialLayers }),
      ),
    );
    const onRegenerate = vi.fn();
    const user = userEvent.setup();
    show({ onRegenerate });
    await user.type(await screen.findByLabelText("Exact replacement (fr)"), "Plus près");
    await user.click(screen.getByRole("button", { name: "Save & regenerate" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Save & regenerate" }),
    );
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toBeInTheDocument();
    expect(onRegenerate).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Exact replacement (fr)")).toHaveValue("Plus près");
  });
  it("moves the divider with the keyboard on the image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ textLayers: null })),
    );
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Overlay comparison" }));
    fireEvent.load(screen.getByAltText("Localised image"));
    const divider = screen.getByRole("slider", { name: "Original and localised image divider" });
    expect(divider.closest('[class*="absolute inset-0"]')).not.toBeNull();
    divider.focus();
    await user.keyboard("{ArrowRight}");
    expect(divider).toHaveValue("51");
    await user.keyboard("{Home}");
    expect(divider).toHaveValue("0");
  });
  it("keeps the original visible when the comparison image fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ textLayers: null })),
    );
    const user = userEvent.setup();
    const { container } = show();
    await user.click(await screen.findByRole("button", { name: "Overlay comparison" }));

    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(2);
    fireEvent.load(images[0]);
    fireEvent.error(images[1]);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(images[0].closest("div.relative")).not.toHaveClass("hidden");
    expect(container.querySelector('[role="slider"]')).not.toBeInTheDocument();
  });
});
