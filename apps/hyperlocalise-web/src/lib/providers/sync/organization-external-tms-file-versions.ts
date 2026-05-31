import { and, desc, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";

type SnapshotDbClient = Pick<typeof db, "select" | "insert">;

export type ExternalTmsFileVersionSnapshot = {
  organizationId: string;
  projectId: string;
  externalTmsFileId: string;
  sourcePath: string;
  revision: string | null;
  sourceHash: string | null;
  storedFileId: string | null;
  format: string | null;
  capturedAt?: Date;
};

function versionIdentity(revision: string | null, sourceHash: string | null) {
  return `${revision ?? ""}:${sourceHash ?? ""}`;
}

export async function snapshotExternalTmsFileVersion(
  input: ExternalTmsFileVersionSnapshot,
  dbClient: SnapshotDbClient = db,
) {
  const [latest] = await dbClient
    .select({
      revision: schema.externalTmsFileVersions.revision,
      sourceHash: schema.externalTmsFileVersions.sourceHash,
    })
    .from(schema.externalTmsFileVersions)
    .where(eq(schema.externalTmsFileVersions.externalTmsFileId, input.externalTmsFileId))
    .orderBy(
      desc(schema.externalTmsFileVersions.capturedAt),
      desc(schema.externalTmsFileVersions.id),
    )
    .limit(1);

  if (
    latest &&
    versionIdentity(latest.revision, latest.sourceHash) ===
      versionIdentity(input.revision, input.sourceHash)
  ) {
    return null;
  }

  const [version] = await dbClient
    .insert(schema.externalTmsFileVersions)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      externalTmsFileId: input.externalTmsFileId,
      sourcePath: input.sourcePath,
      revision: input.revision,
      sourceHash: input.sourceHash,
      storedFileId: input.storedFileId,
      format: input.format,
      capturedAt: input.capturedAt ?? new Date(),
    })
    .returning();

  return version ?? null;
}

export async function listExternalTmsFileVersionsForFile(input: {
  organizationId: string;
  projectId: string;
  externalTmsFileId: string;
  limit?: number;
}) {
  return db
    .select()
    .from(schema.externalTmsFileVersions)
    .where(
      and(
        eq(schema.externalTmsFileVersions.organizationId, input.organizationId),
        eq(schema.externalTmsFileVersions.projectId, input.projectId),
        eq(schema.externalTmsFileVersions.externalTmsFileId, input.externalTmsFileId),
      ),
    )
    .orderBy(
      desc(schema.externalTmsFileVersions.capturedAt),
      desc(schema.externalTmsFileVersions.id),
    )
    .limit(input.limit ?? 50);
}
