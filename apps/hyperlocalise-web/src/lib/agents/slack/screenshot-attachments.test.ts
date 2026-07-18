import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { getStoredFileContent } from "@/lib/file-storage/records";

import {
  buildSlackScreenshotFileUploads,
  extractSuccessfulCaptureScreenshots,
} from "./screenshot-attachments";

vi.mock("@/lib/file-storage/records", () => ({
  getStoredFileContent: vi.fn(),
}));

vi.mock("@/lib/agent-runtime/tools/workspace/capture-screenshot", () => ({
  isCaptureScreenshotSuccess: (output: unknown) =>
    Boolean(output) &&
    typeof output === "object" &&
    (output as { success?: boolean }).success === true &&
    typeof (output as { fileId?: unknown }).fileId === "string",
}));

vi.mock("@/lib/log", () => ({
  createLogger: vi.fn(() => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  })),
  serializeErrorForLog: vi.fn((error: unknown) => ({ error })),
}));

function successfulScreenshot(overrides: {
  fileId: string;
  filename?: string;
  contentType?: string;
}) {
  return {
    success: true as const,
    fileId: overrides.fileId,
    url: `https://app.example/files/${overrides.fileId}`,
    filename: overrides.filename ?? `${overrides.fileId}.png`,
    contentType: overrides.contentType ?? "image/png",
    byteSize: 12,
    workspacePath: "/tmp/workspace",
    screenshotPath: "/tmp/workspace/screenshot.png",
    target: { type: "storybook" as const, storyId: "button--primary" },
    viewport: { width: 1280, height: 720 },
    storybookUrl: "http://localhost:6006",
  };
}

describe("extractSuccessfulCaptureScreenshots", () => {
  it("collects successful screenshots from all steps in order", () => {
    const first = successfulScreenshot({ fileId: "file_a" });
    const second = successfulScreenshot({ fileId: "file_b" });

    const screenshots = extractSuccessfulCaptureScreenshots({
      steps: [
        {
          toolResults: [
            {
              toolName: "captureScreenshot",
              output: first,
            },
          ],
        },
        {
          toolResults: [
            {
              toolName: "captureScreenshot",
              output: {
                success: false,
                errorCode: "story_not_found",
                error: "missing",
              },
            },
          ],
        },
        {
          toolResults: [
            {
              toolName: "captureScreenshot",
              output: second,
            },
            {
              toolName: "captureScreenshot",
              preliminary: true,
              output: successfulScreenshot({ fileId: "file_preliminary" }),
            },
          ],
        },
      ],
      toolResults: [
        {
          toolName: "captureScreenshot",
          output: successfulScreenshot({ fileId: "file_last_step_only" }),
        },
      ],
    });

    expect(screenshots.map((screenshot) => screenshot.fileId)).toEqual(["file_a", "file_b"]);
  });

  it("falls back to top-level toolResults when steps are empty", () => {
    const screenshot = successfulScreenshot({ fileId: "file_top" });

    const screenshots = extractSuccessfulCaptureScreenshots({
      toolResults: [
        {
          toolName: "captureScreenshot",
          output: screenshot,
        },
        {
          toolName: "otherTool",
          output: { ok: true },
        },
      ],
    });

    expect(screenshots).toEqual([screenshot]);
  });

  it("returns an empty list when no captureScreenshot tools ran", () => {
    expect(extractSuccessfulCaptureScreenshots({ text: "hello" } as never)).toEqual([]);
    expect(extractSuccessfulCaptureScreenshots({ steps: [] })).toEqual([]);
  });
});

describe("buildSlackScreenshotFileUploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads stored bytes for each screenshot", async () => {
    vi.mocked(getStoredFileContent)
      .mockResolvedValueOnce({
        file: { id: "file_a" },
        content: Buffer.from("a"),
      } as never)
      .mockResolvedValueOnce({
        file: { id: "file_b" },
        content: Buffer.from("b"),
      } as never);

    const uploads = await buildSlackScreenshotFileUploads({
      screenshots: [
        successfulScreenshot({ fileId: "file_a", filename: "a.png" }),
        successfulScreenshot({
          fileId: "file_b",
          filename: "b.png",
          contentType: "image/jpeg",
        }),
      ],
      organizationId: "org-123",
      projectId: "project-123",
    });

    expect(getStoredFileContent).toHaveBeenNthCalledWith(1, {
      fileId: "file_a",
      organizationId: "org-123",
      projectId: "project-123",
    });
    expect(getStoredFileContent).toHaveBeenNthCalledWith(2, {
      fileId: "file_b",
      organizationId: "org-123",
      projectId: "project-123",
    });
    expect(uploads).toEqual([
      {
        data: Buffer.from("a"),
        filename: "a.png",
        mimeType: "image/png",
      },
      {
        data: Buffer.from("b"),
        filename: "b.png",
        mimeType: "image/jpeg",
      },
    ]);
  });

  it("skips screenshots that fail to load", async () => {
    vi.mocked(getStoredFileContent)
      .mockRejectedValueOnce(new Error("missing"))
      .mockResolvedValueOnce({
        file: { id: "file_b" },
        content: Buffer.from("b"),
      } as never);

    const uploads = await buildSlackScreenshotFileUploads({
      screenshots: [
        successfulScreenshot({ fileId: "file_a" }),
        successfulScreenshot({ fileId: "file_b", filename: "b.png" }),
      ],
      organizationId: "org-123",
      projectId: null,
    });

    expect(uploads).toEqual([
      {
        data: Buffer.from("b"),
        filename: "b.png",
        mimeType: "image/png",
      },
    ]);
  });
});
