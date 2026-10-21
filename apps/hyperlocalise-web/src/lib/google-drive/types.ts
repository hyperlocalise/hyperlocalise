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

export type GoogleDrivePipesError =
  | { code: "google_drive_pipes_unavailable"; message: string }
  | { code: "google_drive_not_connected"; message: string }
  | { code: "google_drive_pipes_needs_reauthorization"; message: string }
  | { code: "google_drive_api_not_enabled"; message: string; status?: number }
  | { code: "google_drive_file_too_large"; message: string }
  | { code: "google_drive_api_error"; message: string; status?: number; reason?: string };

export type GoogleDriveFileSummary = {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  modifiedTime: string | null;
  md5Checksum: string | null;
  parents: string[];
  driveId: string | null;
};

export type GoogleDriveSharedDriveSummary = {
  id: string;
  name: string;
};
