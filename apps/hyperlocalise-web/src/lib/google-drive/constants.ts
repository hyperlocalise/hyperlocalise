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

export const GOOGLE_DRIVE_PIPES_SLUG = "google-drive" as const;

export const GOOGLE_DRIVE_UPLOAD_SURFACE = "google_drive" as const;

export const GOOGLE_DRIVE_SOURCE_PATH_PREFIX = "google-drive";

export function isGoogleDriveSourcePath(sourcePath: string): boolean {
  return sourcePath.startsWith(`${GOOGLE_DRIVE_SOURCE_PATH_PREFIX}/`);
}

export const GOOGLE_DRIVE_FILE_IMPORT_CONCURRENCY = 4;

export const GOOGLE_DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
export const GOOGLE_DRIVE_UPLOAD_API_BASE = "https://www.googleapis.com/upload/drive/v3";

/** Google `files.export` limit; larger exports use exportLinks. */
export const GOOGLE_DRIVE_EXPORT_API_MAX_BYTES = 10 * 1024 * 1024;

export const GOOGLE_MIME = {
  folder: "application/vnd.google-apps.folder",
  document: "application/vnd.google-apps.document",
  spreadsheet: "application/vnd.google-apps.spreadsheet",
  presentation: "application/vnd.google-apps.presentation",
  script: "application/vnd.google-apps.script",
  drawing: "application/vnd.google-apps.drawing",
  form: "application/vnd.google-apps.form",
  site: "application/vnd.google-apps.site",
  shortcut: "application/vnd.google-apps.shortcut",
} as const;

export const GOOGLE_EXPORT_MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const;
