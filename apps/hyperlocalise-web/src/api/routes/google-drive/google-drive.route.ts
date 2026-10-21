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

import { Hono } from "hono";
import { validator } from "hono/validator";

import { hasCapability } from "@/api/auth/policy";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import {
  badRequestResponse,
  forbiddenResponse,
  serviceUnavailableResponse,
} from "@/api/response.schema";
import { classifyGoogleDriveItem } from "@/lib/google-drive/file-classification";
import { GOOGLE_MIME } from "@/lib/google-drive/constants";
import {
  getGoogleDriveFile,
  listGoogleDriveChildren,
  listGoogleSharedDrives,
} from "@/lib/google-drive/drive-api";
import {
  deleteGoogleDriveFolder,
  insertGoogleDriveFolder,
  listGoogleDriveFoldersForOrganization,
} from "@/lib/google-drive/folder-records";
import { loadGoogleDrivePipesAccessToken } from "@/lib/google-drive/pipes";
import { isAnyTranslationOutputFile } from "@/lib/google-drive/translation-filename";
import { GOOGLE_DRIVE_MAX_BROWSER_FILES } from "@/lib/google-drive/limits";
import { isErr } from "@/lib/primitives/result/results";

import {
  googleDriveAddFolderBodySchema,
  googleDriveChildrenQuerySchema,
  googleDriveFolderIdParamSchema,
} from "./google-drive.schema";

function canReadIntegrations(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:read");
}

function canWriteIntegrations(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:write");
}

async function loadDriveAccessToken(c: { var: AuthVariables }) {
  return loadGoogleDrivePipesAccessToken({
    localOrganizationId: c.var.auth.organization.localOrganizationId,
    workosUserId: c.var.auth.user.workosUserId,
  });
}

export function createGoogleDriveRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/drives", async (c) => {
      if (!canReadIntegrations(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const tokenResult = await loadDriveAccessToken(c);
      if (isErr(tokenResult)) {
        return serviceUnavailableResponse(c, tokenResult.error.code, tokenResult.error.message);
      }

      const drivesResult = await listGoogleSharedDrives({ accessToken: tokenResult.value });
      if (isErr(drivesResult)) {
        return serviceUnavailableResponse(c, drivesResult.error.code, drivesResult.error.message);
      }

      return c.json(
        {
          drives: [
            { id: "root", name: "My Drive", kind: "my_drive" as const },
            ...drivesResult.value.map((drive) => ({
              id: drive.id,
              name: drive.name,
              kind: "shared_drive" as const,
            })),
          ],
        },
        200,
      );
    })
    .get(
      "/children",
      validator("query", (value, c) => {
        const parsed = googleDriveChildrenQuerySchema.safeParse(value);
        if (!parsed.success) {
          return badRequestResponse(c, "invalid_query", "Query parameters are invalid.");
        }
        return parsed.data;
      }),
      async (c) => {
        if (!canReadIntegrations(c.var.auth.membership.role)) {
          return forbiddenResponse(c, "forbidden");
        }

        const query = c.req.valid("query");
        const tokenResult = await loadDriveAccessToken(c);
        if (isErr(tokenResult)) {
          return serviceUnavailableResponse(c, tokenResult.error.code, tokenResult.error.message);
        }

        const driveId = query.driveId && query.driveId !== "root" ? query.driveId : null;
        const folderId = driveId ? query.folderId : query.folderId;
        const childrenResult = await listGoogleDriveChildren({
          accessToken: tokenResult.value,
          folderId,
          driveId,
          pageToken: query.pageToken,
        });
        if (isErr(childrenResult)) {
          return serviceUnavailableResponse(
            c,
            childrenResult.error.code,
            childrenResult.error.message,
          );
        }

        const hideTranslations = !query.showTranslations;
        const items = [];
        for (const file of childrenResult.value.files) {
          if (hideTranslations && isAnyTranslationOutputFile({ name: file.name })) {
            continue;
          }
          const classification = classifyGoogleDriveItem({
            name: file.name,
            mimeType: file.mimeType,
            sizeBytes: file.size,
            folderDepth: query.depth,
            hideTranslationOutputs: hideTranslations,
          });
          items.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            size: file.size,
            modifiedTime: file.modifiedTime,
            isFolder: file.mimeType === GOOGLE_MIME.folder,
            classification:
              classification.kind === "folder"
                ? { status: "folder" as const }
                : classification.kind === "supported"
                  ? {
                      status: "supported" as const,
                      ingestFormat: classification.ingestFormat,
                    }
                  : {
                      status: "skipped" as const,
                      reason: classification.reason,
                    },
          });
          if (items.length >= GOOGLE_DRIVE_MAX_BROWSER_FILES) {
            break;
          }
        }

        return c.json(
          {
            items,
            nextPageToken: childrenResult.value.nextPageToken,
            truncated: items.length >= GOOGLE_DRIVE_MAX_BROWSER_FILES,
          },
          200,
        );
      },
    )
    .get("/folders", async (c) => {
      if (!canReadIntegrations(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const folders = await listGoogleDriveFoldersForOrganization(
        c.var.auth.organization.localOrganizationId,
      );
      const tokenResult = await loadDriveAccessToken(c);
      const accessToken = isErr(tokenResult) ? null : tokenResult.value;
      const enriched = await Promise.all(
        folders.map(async (folder) => {
          if (folder.folderId === "root") {
            return {
              ...folder,
              mimeType: GOOGLE_MIME.folder,
              isFolder: true,
            };
          }
          if (!accessToken) {
            return { ...folder, mimeType: null, isFolder: true };
          }
          const meta = await getGoogleDriveFile({
            accessToken,
            fileId: folder.folderId,
          });
          if (isErr(meta)) {
            return { ...folder, mimeType: null, isFolder: true };
          }
          return {
            ...folder,
            mimeType: meta.value.mimeType,
            isFolder: meta.value.mimeType === GOOGLE_MIME.folder,
          };
        }),
      );
      return c.json({ folders: enriched }, 200);
    })
    .post(
      "/folders",
      validator("json", (value, c) => {
        const parsed = googleDriveAddFolderBodySchema.safeParse(value);
        if (!parsed.success) {
          return badRequestResponse(c, "invalid_payload", "Folder payload is invalid.");
        }
        return parsed.data;
      }),
      async (c) => {
        if (!canWriteIntegrations(c.var.auth.membership.role)) {
          return forbiddenResponse(c, "forbidden");
        }

        const body = c.req.valid("json");
        const row = await insertGoogleDriveFolder({
          organizationId: c.var.auth.organization.localOrganizationId,
          connectedByWorkosUserId: c.var.auth.user.workosUserId,
          driveId: body.driveId ?? null,
          folderId: body.folderId,
          name: body.name,
          pathLabel: body.pathLabel,
        });
        if (!row) {
          return c.json({ folder: null, alreadyExists: true }, 200);
        }
        return c.json({ folder: row, alreadyExists: false }, 201);
      },
    )
    .delete(
      "/folders/:folderRecordId",
      validator("param", (value, c) => {
        const parsed = googleDriveFolderIdParamSchema.safeParse({
          folderRecordId: value.folderRecordId,
        });
        if (!parsed.success) {
          return badRequestResponse(c, "invalid_folder_id", "Folder id is invalid.");
        }
        return parsed.data;
      }),
      async (c) => {
        if (!canWriteIntegrations(c.var.auth.membership.role)) {
          return forbiddenResponse(c, "forbidden");
        }

        const { folderRecordId } = c.req.valid("param");
        await deleteGoogleDriveFolder({
          organizationId: c.var.auth.organization.localOrganizationId,
          folderRecordId,
        });
        return c.body(null, 204);
      },
    );
}
