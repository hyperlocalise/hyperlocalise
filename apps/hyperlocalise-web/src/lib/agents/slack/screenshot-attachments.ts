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
  const fromSteps = (result.steps ?? []).flatMap((step) => step.toolResults ?? []);
  if (fromSteps.length > 0) {
    return fromSteps;
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
  const uploads: SlackScreenshotFileUpload[] = [];

  for (const screenshot of input.screenshots) {
    try {
      const { content } = await getStoredFileContent({
        fileId: screenshot.fileId,
        organizationId: input.organizationId,
        projectId: input.projectId,
      });
      uploads.push({
        data: content,
        filename: screenshot.filename,
        mimeType: screenshot.contentType || "image/png",
      });
    } catch (error) {
      log.warn(
        {
          err: serializeErrorForLog(error),
          fileId: screenshot.fileId,
          organizationId: input.organizationId,
          projectId: input.projectId,
        },
        "failed to load captureScreenshot artifact for Slack upload",
      );
    }
  }

  return uploads;
}
