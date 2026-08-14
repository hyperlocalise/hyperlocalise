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
import {
  regenerateVideoFromAttachment,
  type VideoGenerationBilling,
} from "@/lib/agents/video-generation";

type LocalizeVideoAttachmentInput = {
  filename?: string;
  mimeType?: string | null;
  sourceLocale?: string | null;
  targetLocale?: string | null;
  instructions?: string | null;
  contextLines?: Array<string | null | undefined>;
  billing?: VideoGenerationBilling;
  durationSeconds?: number;
};

function filenameLocaleSuffix(targetLocale: string | null | undefined) {
  return targetLocale
    ? `-${targetLocale.toLowerCase().replace(/[^a-z0-9._-]+/g, "-")}`
    : "-localized";
}

export function localizedVideoOutputFilename(
  filename: string | undefined,
  targetLocale: string | null | undefined,
) {
  const suffix = filenameLocaleSuffix(targetLocale);
  if (!filename) {
    return `video${suffix}.mp4`;
  }

  const extensionStart = filename.lastIndexOf(".");
  if (extensionStart <= 0) {
    return `${filename}${suffix}.mp4`;
  }

  return `${filename.slice(0, extensionStart)}${suffix}.mp4`;
}

export function buildVideoLocalizationPrompt(input: {
  filename?: string;
  sourceLocale?: string | null;
  targetLocale?: string | null;
  instructions?: string | null;
  contextLines?: Array<string | null | undefined>;
}) {
  return [
    "Use the attached video as the source and generate a localized version.",
    "Preserve the original layout, style, composition, motion, brand treatment, and visual hierarchy unless the user explicitly asks for a change.",
    "Localize on-screen text and spoken audio into the target locale. Keep everything else the same.",
    input.sourceLocale ? `Source locale: ${input.sourceLocale}` : "Source locale: auto-detect",
    input.targetLocale ? `Target locale: ${input.targetLocale}` : null,
    input.instructions ? `User instructions: ${input.instructions}` : null,
    ...(input.contextLines ?? []),
    input.filename ? `Source filename: ${input.filename}` : null,
  ]
    .filter((line): line is string => line !== null && line !== undefined)
    .join("\n");
}

export async function localizeVideoBuffer(video: Buffer, input: LocalizeVideoAttachmentInput) {
  const prompt = buildVideoLocalizationPrompt(input);
  const result = await regenerateVideoFromAttachment(
    video,
    input.mimeType ?? "video/mp4",
    prompt,
    input.billing,
    input.durationSeconds,
  );
  const mimeType = result.mimeType || "video/mp4";

  return {
    data: result.video,
    filename: localizedVideoOutputFilename(input.filename, input.targetLocale),
    mimeType,
    prompt: result.prompt,
  };
}
