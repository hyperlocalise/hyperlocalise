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
import type { ProjectFileContentEditorVisualContextMatchBody } from "@/api/routes/project/project.schema";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import {
  VISUAL_CONTEXT_SCREENSHOT_MAX_BYTES,
  type ContentEditorVisualContext,
} from "@/lib/translation/content-editor-visual-context";

const VISUAL_CONTEXT_UPLOAD_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
// The browser sets these from the body and URL; fetch rejects or ignores them.
const BROWSER_MANAGED_HEADERS = new Set(["content-length", "host"]);

export class VisualContextScreenshotTooLargeError extends Error {
  constructor() {
    super("Screenshot exceeds the 10 MB upload limit");
    this.name = "VisualContextScreenshotTooLargeError";
  }
}

export function isVisualContextScreenshotFile(file: File) {
  return VISUAL_CONTEXT_UPLOAD_TYPES.has(file.type);
}

export function isVisualContextScreenshotTooLarge(file: File) {
  return file.size > VISUAL_CONTEXT_SCREENSHOT_MAX_BYTES;
}

export async function uploadNativeVisualContextScreenshot(input: {
  client: GoSvcClient;
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  externalStringId: string;
  file: File;
  match?: ProjectFileContentEditorVisualContextMatchBody;
}): Promise<ContentEditorVisualContext> {
  if (isVisualContextScreenshotTooLarge(input.file)) {
    throw new VisualContextScreenshotTooLargeError();
  }
  const created = await input.client.cat.createVisualContextScreenshot(
    input.organizationSlug,
    input.projectId,
    {
      filename: input.file.name,
      contentType: input.file.type || "application/octet-stream",
      byteSize: input.file.size,
      name: input.file.name.replace(/\.[^.]+$/, "") || input.file.name,
      sourcePath: input.sourcePath,
      externalStringId: input.externalStringId,
    },
  );
  try {
    const headers = new Headers();
    for (const [name, values] of Object.entries(created.upload.headers)) {
      if (!BROWSER_MANAGED_HEADERS.has(name.toLowerCase())) {
        headers.set(name, values.join(","));
      }
    }
    const uploaded = await fetch(created.upload.url, {
      method: created.upload.method,
      headers,
      body: input.file,
    });
    if (!uploaded.ok) {
      throw new Error("Failed to upload screenshot");
    }
    await input.client.cat.finalizeVisualContextScreenshot(
      input.organizationSlug,
      input.projectId,
      created.screenshot.id,
      input.match ? { match: input.match } : {},
    );
  } catch (error) {
    await input.client.cat
      .deleteVisualContextScreenshot(input.organizationSlug, input.projectId, created.screenshot.id)
      .catch(() => undefined);
    throw error;
  }
  const { visualContext } = await input.client.cat.visualContext(
    input.organizationSlug,
    input.projectId,
    {
      sourcePath: input.sourcePath,
      externalStringId: input.externalStringId,
    },
  );
  return visualContext;
}
