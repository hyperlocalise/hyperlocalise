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
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import type { ContentEditorVisualContext } from "@/lib/translation/content-editor-visual-context";

const VISUAL_CONTEXT_UPLOAD_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function isVisualContextScreenshotFile(file: File) {
  return VISUAL_CONTEXT_UPLOAD_TYPES.has(file.type);
}

export async function uploadNativeVisualContextScreenshot(input: {
  client: GoSvcClient;
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  externalStringId: string;
  file: File;
}): Promise<ContentEditorVisualContext> {
  const created = await input.client.cat.createVisualContextScreenshot(
    input.organizationSlug,
    input.projectId,
    {
      filename: input.file.name,
      contentType: input.file.type || "application/octet-stream",
      name: input.file.name.replace(/\.[^.]+$/, "") || input.file.name,
      sourcePath: input.sourcePath,
      externalStringId: input.externalStringId,
    },
  );
  const headers = new Headers();
  for (const [name, values] of Object.entries(created.upload.headers)) {
    headers.set(name, values.join(","));
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
  );
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
