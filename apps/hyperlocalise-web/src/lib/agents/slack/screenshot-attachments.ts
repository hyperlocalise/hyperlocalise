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
import { getStoredFileContent } from "@/lib/file-storage/records";
import {
  isCaptureScreenshotSuccess,
  type CaptureScreenshotSuccess,
} from "@/lib/agent-runtime/tools/workspace/capture-screenshot";
import { createLogger, serializeErrorForLog } from "@/lib/log";

const log = createLogger("slack-screenshot-attachments");

type ToolResultLike = {
  toolName?: string;
  output?: unknown;
  preliminary?: boolean;
};

type StepLike = {
  toolResults?: ToolResultLike[];
};

export type GenerateResultWithToolSteps = {
  steps?: StepLike[];
  toolResults?: ToolResultLike[];
};

export type SlackScreenshotFileUpload = {
  data: Buffer;
  filename: string;
  mimeType: string;
};

function collectToolResults(result: GenerateResultWithToolSteps): ToolResultLike[] {
  // Prefer steps whenever present (including empty / text-only steps). Fall back
  // to top-level toolResults only for callers/mocks that omit steps entirely.
  if (result.steps !== undefined) {
    return result.steps.flatMap((step) => step.toolResults ?? []);
  }
  return result.toolResults ?? [];
}

export function extractSuccessfulCaptureScreenshots(
  result: GenerateResultWithToolSteps,
): CaptureScreenshotSuccess[] {
  return collectToolResults(result)
    .filter(
      (toolResult) =>
        toolResult.toolName === "captureScreenshot" &&
        !toolResult.preliminary &&
        isCaptureScreenshotSuccess(toolResult.output),
    )
    .map((toolResult) => toolResult.output as CaptureScreenshotSuccess);
}

export async function buildSlackScreenshotFileUploads(input: {
  screenshots: CaptureScreenshotSuccess[];
  organizationId: string;
  projectId: string | null;
}): Promise<SlackScreenshotFileUpload[]> {
  const results = await Promise.allSettled(
    input.screenshots.map((screenshot) =>
      getStoredFileContent({
        fileId: screenshot.fileId,
        organizationId: input.organizationId,
        projectId: input.projectId,
      }).then(({ content }) => ({
        data: content,
        filename: screenshot.filename,
        mimeType: screenshot.contentType || "image/png",
      })),
    ),
  );

  const uploads: SlackScreenshotFileUpload[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      uploads.push(result.value);
      continue;
    }

    const screenshot = input.screenshots[i];
    log.warn(
      {
        err: serializeErrorForLog(result.reason),
        fileId: screenshot?.fileId,
        organizationId: input.organizationId,
        projectId: input.projectId,
      },
      "failed to load captureScreenshot artifact for Slack upload",
    );
  }

  return uploads;
}
