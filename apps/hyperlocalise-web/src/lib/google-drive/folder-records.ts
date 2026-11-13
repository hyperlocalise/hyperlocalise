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

import { and, asc, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";

export async function listGoogleDriveFoldersForOrganization(organizationId: string) {
  return db
    .select()
    .from(schema.googleDriveFolders)
    .where(eq(schema.googleDriveFolders.organizationId, organizationId))
    .orderBy(asc(schema.googleDriveFolders.createdAt));
}

export async function insertGoogleDriveFolder(input: {
  organizationId: string;
  connectedByWorkosUserId: string;
  driveId: string | null;
  folderId: string;
  name: string;
  pathLabel: string;
}) {
  const [row] = await db
    .insert(schema.googleDriveFolders)
    .values({
      organizationId: input.organizationId,
      connectedByWorkosUserId: input.connectedByWorkosUserId,
      driveId: input.driveId,
      folderId: input.folderId,
      name: input.name,
      pathLabel: input.pathLabel,
    })
    .onConflictDoNothing({
      target: [schema.googleDriveFolders.organizationId, schema.googleDriveFolders.folderId],
    })
    .returning();
  return row ?? null;
}

export async function deleteGoogleDriveFolder(input: {
  organizationId: string;
  folderRecordId: string;
}) {
  await db
    .delete(schema.googleDriveFolders)
    .where(
      and(
        eq(schema.googleDriveFolders.organizationId, input.organizationId),
        eq(schema.googleDriveFolders.id, input.folderRecordId),
      ),
    );
}
