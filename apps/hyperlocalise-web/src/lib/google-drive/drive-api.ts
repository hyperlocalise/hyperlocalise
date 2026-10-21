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

import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import {
  GOOGLE_DRIVE_API_BASE,
  GOOGLE_DRIVE_EXPORT_API_MAX_BYTES,
  GOOGLE_DRIVE_UPLOAD_API_BASE,
  GOOGLE_MIME,
} from "./constants";
import type {
  GoogleDriveFileSummary,
  GoogleDrivePipesError,
  GoogleDriveSharedDriveSummary,
} from "./types";

type DriveListResponse = {
  files?: DriveFileResource[];
  nextPageToken?: string;
};

type DriveFileResource = {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  md5Checksum?: string;
  parents?: string[];
  driveId?: string;
  exportLinks?: Record<string, string>;
};

type DriveListDrivesResponse = {
  drives?: { id?: string; name?: string }[];
  nextPageToken?: string;
};

function mapDriveFile(resource: DriveFileResource): GoogleDriveFileSummary | null {
  const id = resource.id?.trim();
  const name = resource.name?.trim();
  const mimeType = resource.mimeType?.trim();
  if (!id || !name || !mimeType) {
    return null;
  }
  const sizeRaw = resource.size?.trim();
  const size = sizeRaw ? Number.parseInt(sizeRaw, 10) : null;
  return {
    id,
    name,
    mimeType,
    size: Number.isFinite(size) ? size : null,
    modifiedTime: resource.modifiedTime ?? null,
    md5Checksum: resource.md5Checksum ?? null,
    parents: resource.parents ?? [],
    driveId: resource.driveId ?? null,
  };
}

type GoogleApiErrorBody = {
  error?: {
    message?: string;
    status?: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };
};

const DRIVE_API_NOT_ENABLED_MESSAGE =
  "The Google Drive API is not enabled for the OAuth project. Enable drive.googleapis.com in Google Cloud Console, then disconnect and reconnect Google Drive.";

async function googleDriveErrorFromResponse(response: Response): Promise<GoogleDrivePipesError> {
  let reason: string | undefined;
  try {
    const body = (await response.json()) as GoogleApiErrorBody;
    reason =
      body.error?.errors?.[0]?.reason?.trim() ||
      body.error?.status?.trim() ||
      body.error?.message?.trim();
  } catch {
    reason = undefined;
  }
  if (reason === "accessNotConfigured") {
    return {
      code: "google_drive_api_not_enabled",
      status: response.status,
      message: DRIVE_API_NOT_ENABLED_MESSAGE,
    };
  }
  return {
    code: "google_drive_api_error",
    status: response.status,
    reason,
    message: reason
      ? `Google Drive API returned ${response.status} (${reason}).`
      : `Google Drive API returned ${response.status}.`,
  };
}

async function driveFetch(
  accessToken: string,
  url: string,
  init?: RequestInit & { signal?: AbortSignal },
): Promise<Result<Response, GoogleDrivePipesError>> {
  try {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    const response = await fetch(url, {
      ...init,
      headers,
    });
    if (!response.ok) {
      return err(await googleDriveErrorFromResponse(response));
    }
    return ok(response);
  } catch {
    return err({
      code: "google_drive_api_error",
      message: "Google Drive API request failed.",
    });
  }
}

export async function listGoogleSharedDrives(input: {
  accessToken: string;
  signal?: AbortSignal;
}): Promise<Result<GoogleDriveSharedDriveSummary[], GoogleDrivePipesError>> {
  const drives: GoogleDriveSharedDriveSummary[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      pageSize: "100",
    });
    if (pageToken) {
      params.set("pageToken", pageToken);
    }
    const url = `${GOOGLE_DRIVE_API_BASE}/drives?${params.toString()}`;
    const responseResult = await driveFetch(input.accessToken, url, { signal: input.signal });
    if (isErr(responseResult)) {
      // Shared-drive listing needs drive / drive.readonly. WorkOS often grants
      // drive.file, which 403s here while My Drive file listing still works.
      if (
        responseResult.error.code === "google_drive_api_error" &&
        responseResult.error.reason === "insufficientPermissions"
      ) {
        return ok([]);
      }
      return err(responseResult.error);
    }
    const body = (await responseResult.value.json()) as DriveListDrivesResponse;
    for (const drive of body.drives ?? []) {
      const id = drive.id?.trim();
      const name = drive.name?.trim();
      if (id && name) {
        drives.push({ id, name });
      }
    }
    pageToken = body.nextPageToken;
  } while (pageToken);

  return ok(drives);
}

export async function listGoogleDriveChildren(input: {
  accessToken: string;
  folderId: string;
  driveId?: string | null;
  pageToken?: string;
  pageSize?: number;
  signal?: AbortSignal;
}): Promise<
  Result<{ files: GoogleDriveFileSummary[]; nextPageToken: string | null }, GoogleDrivePipesError>
> {
  const folderId = input.folderId.trim();
  const params = new URLSearchParams({
    q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed=false`,
    fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,md5Checksum,parents,driveId)",
    pageSize: String(input.pageSize ?? 200),
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  if (input.driveId?.trim()) {
    params.set("corpora", "drive");
    params.set("driveId", input.driveId.trim());
  } else {
    params.set("corpora", "user");
  }
  if (input.pageToken) {
    params.set("pageToken", input.pageToken);
  }

  const url = `${GOOGLE_DRIVE_API_BASE}/files?${params.toString()}`;
  const responseResult = await driveFetch(input.accessToken, url, { signal: input.signal });
  if (isErr(responseResult)) {
    return err(responseResult.error);
  }
  const body = (await responseResult.value.json()) as DriveListResponse;
  const files = (body.files ?? [])
    .map(mapDriveFile)
    .filter((file): file is GoogleDriveFileSummary => file !== null);
  return ok({
    files,
    nextPageToken: body.nextPageToken ?? null,
  });
}

export async function getGoogleDriveFile(input: {
  accessToken: string;
  fileId: string;
  signal?: AbortSignal;
}): Promise<
  Result<GoogleDriveFileSummary & { exportLinks?: Record<string, string> }, GoogleDrivePipesError>
> {
  const params = new URLSearchParams({
    fields: "id,name,mimeType,size,modifiedTime,md5Checksum,parents,driveId,exportLinks",
    supportsAllDrives: "true",
  });
  const url = `${GOOGLE_DRIVE_API_BASE}/files/${encodeURIComponent(input.fileId)}?${params.toString()}`;
  const responseResult = await driveFetch(input.accessToken, url, { signal: input.signal });
  if (isErr(responseResult)) {
    return err(responseResult.error);
  }
  const resource = (await responseResult.value.json()) as DriveFileResource;
  const mapped = mapDriveFile(resource);
  if (!mapped) {
    return err({
      code: "google_drive_api_error",
      message: "Google Drive file metadata was incomplete.",
    });
  }
  return ok({ ...mapped, exportLinks: resource.exportLinks });
}

export async function downloadGoogleDriveMedia(input: {
  accessToken: string;
  fileId: string;
  signal?: AbortSignal;
}): Promise<Result<Buffer, GoogleDrivePipesError>> {
  const url = `${GOOGLE_DRIVE_API_BASE}/files/${encodeURIComponent(input.fileId)}?alt=media&supportsAllDrives=true`;
  const responseResult = await driveFetch(input.accessToken, url, { signal: input.signal });
  if (isErr(responseResult)) {
    return err(responseResult.error);
  }
  const arrayBuffer = await responseResult.value.arrayBuffer();
  return ok(Buffer.from(arrayBuffer));
}

export async function exportGoogleDriveFile(input: {
  accessToken: string;
  fileId: string;
  exportMimeType: string;
  exportLinks?: Record<string, string>;
  signal?: AbortSignal;
}): Promise<Result<Buffer, GoogleDrivePipesError>> {
  const exportMimeType = input.exportMimeType.trim();
  const apiUrl = `${GOOGLE_DRIVE_API_BASE}/files/${encodeURIComponent(input.fileId)}/export?mimeType=${encodeURIComponent(exportMimeType)}&supportsAllDrives=true`;
  const responseResult = await driveFetch(input.accessToken, apiUrl, { signal: input.signal });
  if (!isErr(responseResult)) {
    const arrayBuffer = await responseResult.value.arrayBuffer();
    if (arrayBuffer.byteLength <= GOOGLE_DRIVE_EXPORT_API_MAX_BYTES) {
      return ok(Buffer.from(arrayBuffer));
    }
  }

  const link = input.exportLinks?.[exportMimeType]?.trim();
  if (link) {
    const linkResponse = await driveFetch(input.accessToken, link, { signal: input.signal });
    if (isErr(linkResponse)) {
      return err(linkResponse.error);
    }
    const arrayBuffer = await linkResponse.value.arrayBuffer();
    return ok(Buffer.from(arrayBuffer));
  }

  if (isErr(responseResult)) {
    return err(responseResult.error);
  }
  return err({
    code: "google_drive_api_error",
    message: "Google Drive export failed.",
  });
}

export async function findGoogleDriveChildByName(input: {
  accessToken: string;
  parentId: string;
  name: string;
  mimeType?: string;
  driveId?: string | null;
  signal?: AbortSignal;
}): Promise<Result<GoogleDriveFileSummary | null, GoogleDrivePipesError>> {
  const escapedName = input.name.replace(/'/g, "\\'");
  let query = `'${input.parentId.replace(/'/g, "\\'")}' in parents and trashed=false and name='${escapedName}'`;
  if (input.mimeType?.trim()) {
    query += ` and mimeType='${input.mimeType.trim().replace(/'/g, "\\'")}'`;
  }
  const params = new URLSearchParams({
    q: query,
    fields: "files(id,name,mimeType,size,modifiedTime,md5Checksum,parents,driveId)",
    pageSize: "1",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  if (input.driveId?.trim()) {
    params.set("corpora", "drive");
    params.set("driveId", input.driveId.trim());
  } else {
    params.set("corpora", "user");
  }
  const url = `${GOOGLE_DRIVE_API_BASE}/files?${params.toString()}`;
  const responseResult = await driveFetch(input.accessToken, url, { signal: input.signal });
  if (isErr(responseResult)) {
    return err(responseResult.error);
  }
  const body = (await responseResult.value.json()) as DriveListResponse;
  const first = body.files?.[0];
  return ok(first ? mapDriveFile(first) : null);
}

export async function createGoogleDriveFolder(input: {
  accessToken: string;
  parentId: string;
  name: string;
  driveId?: string | null;
  signal?: AbortSignal;
}): Promise<Result<GoogleDriveFileSummary, GoogleDrivePipesError>> {
  const metadata = {
    name: input.name,
    mimeType: GOOGLE_MIME.folder,
    parents: [input.parentId],
  };
  const params = new URLSearchParams({
    supportsAllDrives: "true",
    fields: "id,name,mimeType,size,modifiedTime,md5Checksum,parents,driveId",
  });
  const url = `${GOOGLE_DRIVE_API_BASE}/files?${params.toString()}`;
  const responseResult = await driveFetch(input.accessToken, url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
    signal: input.signal,
  });
  if (isErr(responseResult)) {
    return err(responseResult.error);
  }
  const resource = (await responseResult.value.json()) as DriveFileResource;
  const mapped = mapDriveFile(resource);
  if (!mapped) {
    return err({
      code: "google_drive_api_error",
      message: "Google Drive folder creation failed.",
    });
  }
  return ok(mapped);
}

export async function uploadGoogleDriveFile(input: {
  accessToken: string;
  parentId: string;
  name: string;
  mimeType: string;
  content: Buffer;
  existingFileId?: string | null;
  signal?: AbortSignal;
}): Promise<Result<GoogleDriveFileSummary, GoogleDrivePipesError>> {
  const metadata = {
    name: input.name,
    mimeType: input.mimeType,
    ...(input.existingFileId ? {} : { parents: [input.parentId] }),
  };

  const boundary = `hl_gdrive_${Date.now()}`;
  const preamble = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`,
  );
  const closing = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([preamble, input.content, closing]);

  const params = new URLSearchParams({
    uploadType: "multipart",
    supportsAllDrives: "true",
    fields: "id,name,mimeType,size,modifiedTime,md5Checksum,parents,driveId",
  });

  const path = input.existingFileId
    ? `${GOOGLE_DRIVE_UPLOAD_API_BASE}/files/${encodeURIComponent(input.existingFileId)}?${params.toString()}`
    : `${GOOGLE_DRIVE_UPLOAD_API_BASE}/files?${params.toString()}`;
  const method = input.existingFileId ? "PATCH" : "POST";

  const responseResult = await driveFetch(input.accessToken, path, {
    method,
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
    signal: input.signal,
  });
  if (isErr(responseResult)) {
    return err(responseResult.error);
  }
  const resource = (await responseResult.value.json()) as DriveFileResource;
  const mapped = mapDriveFile(resource);
  if (!mapped) {
    return err({
      code: "google_drive_api_error",
      message: "Google Drive upload failed.",
    });
  }
  return ok(mapped);
}

export async function getGoogleDriveStartPageToken(input: {
  accessToken: string;
  driveId?: string | null;
  signal?: AbortSignal;
}): Promise<Result<string, GoogleDrivePipesError>> {
  const params = new URLSearchParams({ supportsAllDrives: "true" });
  if (input.driveId?.trim()) {
    params.set("driveId", input.driveId.trim());
  }
  const url = `${GOOGLE_DRIVE_API_BASE}/changes/startPageToken?${params.toString()}`;
  const responseResult = await driveFetch(input.accessToken, url, { signal: input.signal });
  if (isErr(responseResult)) {
    return err(responseResult.error);
  }
  const body = (await responseResult.value.json()) as { startPageToken?: string };
  const token = body.startPageToken?.trim();
  if (!token) {
    return err({
      code: "google_drive_api_error",
      message: "Google Drive changes token was missing.",
    });
  }
  return ok(token);
}

export async function listGoogleDriveChanges(input: {
  accessToken: string;
  pageToken: string;
  driveId?: string | null;
  signal?: AbortSignal;
}): Promise<
  Result<
    {
      files: GoogleDriveFileSummary[];
      nextPageToken: string | null;
      newStartPageToken: string | null;
    },
    GoogleDrivePipesError
  >
> {
  const params = new URLSearchParams({
    pageToken: input.pageToken,
    fields:
      "nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,size,modifiedTime,md5Checksum,parents,driveId))",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    pageSize: "200",
  });
  if (input.driveId?.trim()) {
    params.set("driveId", input.driveId.trim());
  }
  const url = `${GOOGLE_DRIVE_API_BASE}/changes?${params.toString()}`;
  const responseResult = await driveFetch(input.accessToken, url, { signal: input.signal });
  if (isErr(responseResult)) {
    return err(responseResult.error);
  }
  const body = (await responseResult.value.json()) as {
    nextPageToken?: string;
    newStartPageToken?: string;
    changes?: {
      removed?: boolean;
      file?: DriveFileResource;
    }[];
  };
  const files: GoogleDriveFileSummary[] = [];
  for (const change of body.changes ?? []) {
    if (change.removed || !change.file) {
      continue;
    }
    const mapped = mapDriveFile(change.file);
    if (mapped) {
      files.push(mapped);
    }
  }
  return ok({
    files,
    nextPageToken: body.nextPageToken ?? null,
    newStartPageToken: body.newStartPageToken ?? null,
  });
}
