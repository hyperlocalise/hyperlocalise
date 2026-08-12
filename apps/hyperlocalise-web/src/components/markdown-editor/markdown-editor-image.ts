"use client";

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
import type { Editor } from "@tiptap/core";

export type MarkdownEditorImageUploadConfig = {
  organizationSlug: string;
  projectId?: string | null;
};

export const MARKDOWN_EDITOR_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";
export const MARKDOWN_EDITOR_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_IMAGE_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function isAllowedMarkdownEditorImageFile(file: File) {
  if (ALLOWED_IMAGE_CONTENT_TYPES.has(file.type)) {
    return true;
  }
  const lower = file.name.toLowerCase();
  return (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp")
  );
}

export function isValidMarkdownEditorImageSrc(src: string) {
  const trimmed = src.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith("/api/orgs/") && trimmed.includes("/files/")) {
    return true;
  }
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function insertMarkdownEditorImage(
  editor: Editor,
  input: { src: string; alt?: string | null },
) {
  const src = input.src.trim();
  if (!isValidMarkdownEditorImageSrc(src)) {
    return false;
  }
  return editor
    .chain()
    .focus()
    .setImage({
      src,
      alt: input.alt?.trim() || undefined,
    })
    .run();
}

export function insertMarkdownEditorImageFromUrl(
  editor: Editor,
  promptLabel: string,
  defaultValue = "https://",
) {
  const url = window.prompt(promptLabel, defaultValue);
  if (url === null) {
    return false;
  }
  return insertMarkdownEditorImage(editor, { src: url });
}

export async function uploadMarkdownEditorImage(input: {
  file: File;
  upload: MarkdownEditorImageUploadConfig;
}): Promise<{ id: string; url: string; filename: string }> {
  if (!isAllowedMarkdownEditorImageFile(input.file)) {
    throw new Error("unsupported_image_type");
  }
  if (input.file.size > MARKDOWN_EDITOR_IMAGE_MAX_BYTES) {
    throw new Error("image_too_large");
  }

  const formData = new FormData();
  formData.set("file", input.file);
  if (input.upload.projectId) {
    formData.set("projectId", input.upload.projectId);
  }

  const response = await fetch(
    `/api/orgs/${encodeURIComponent(input.upload.organizationSlug)}/files`,
    {
      method: "POST",
      body: formData,
    },
  );

  if (!response.ok) {
    let errorCode = "image_upload_failed";
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        errorCode = body.error;
      }
    } catch {
      // Keep the generic failure code when the body is not JSON.
    }
    throw new Error(errorCode);
  }

  const body = (await response.json()) as {
    file: { id: string; url: string; filename: string };
  };
  return body.file;
}

export function pickMarkdownEditorImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = MARKDOWN_EDITOR_IMAGE_ACCEPT;
    let settled = false;
    const finish = (file: File | null) => {
      if (settled) {
        return;
      }
      settled = true;
      window.removeEventListener("focus", onWindowFocus);
      resolve(file);
    };
    const onWindowFocus = () => {
      // Most browsers do not fire `cancel` when the picker is dismissed.
      window.setTimeout(() => {
        finish(input.files?.[0] ?? null);
      }, 300);
    };
    input.onchange = () => {
      finish(input.files?.[0] ?? null);
    };
    input.oncancel = () => {
      finish(null);
    };
    window.addEventListener("focus", onWindowFocus, { once: true });
    input.click();
  });
}

export async function insertMarkdownEditorImageFromUpload(input: {
  editor: Editor;
  file: File;
  upload: MarkdownEditorImageUploadConfig;
}) {
  const uploaded = await uploadMarkdownEditorImage({
    file: input.file,
    upload: input.upload,
  });
  const alt = input.file.name.replace(/\.[^.]+$/, "");
  return insertMarkdownEditorImage(input.editor, { src: uploaded.url, alt });
}

export function collectImageFilesFromDataTransfer(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) {
    return [];
  }
  return Array.from(dataTransfer.files).filter(isAllowedMarkdownEditorImageFile);
}
