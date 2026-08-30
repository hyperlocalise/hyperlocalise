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
import { eq } from "drizzle-orm";

import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import { db, schema, type DatabaseClient } from "@/lib/database/client";

const DEFAULT_MEMORY_NAME = "Translation memory";
const MAX_MEMORY_NAME_LENGTH = 200;

export function defaultNativeProjectMemoryName(projectName: string): string {
  const name = projectName.trim();
  if (name.length === 0) {
    return DEFAULT_MEMORY_NAME;
  }

  return name.slice(0, MAX_MEMORY_NAME_LENGTH);
}

export async function listAttachedProjectMemoryIds(
  projectId: string,
  database: DatabaseClient = db,
): Promise<string[]> {
  const attached = await database
    .select({ memoryId: schema.projectMemories.memoryId })
    .from(schema.projectMemories)
    .where(eq(schema.projectMemories.projectId, projectId));

  return attached.map((row) => row.memoryId);
}

export async function ensureDefaultNativeProjectMemory(input: {
  organizationId: string;
  projectId: string;
  projectName: string;
  createdByUserId?: string | null;
  database?: DatabaseClient;
}): Promise<string[]> {
  const database = input.database ?? db;
  const existing = await listAttachedProjectMemoryIds(input.projectId, database);
  if (existing.length > 0) {
    return existing;
  }

  return database.transaction(async (tx) => {
    const [project] = await tx
      .select({
        id: schema.projects.id,
        source: schema.projects.source,
      })
      .from(schema.projects)
      .where(eq(schema.projects.id, input.projectId))
      .for("update")
      .limit(1);

    if (!project || project.source !== "native") {
      return listAttachedProjectMemoryIds(input.projectId, tx);
    }

    const attached = await listAttachedProjectMemoryIds(input.projectId, tx);
    if (attached.length > 0) {
      return attached;
    }

    const [memory] = await tx
      .insert(schema.memories)
      .values({
        organizationId: input.organizationId,
        createdByUserId: input.createdByUserId ?? null,
        name: defaultNativeProjectMemoryName(input.projectName),
        description: "",
        source: "native",
      })
      .returning({ id: schema.memories.id });

    if (!memory) {
      return [];
    }

    await tx.insert(schema.projectMemories).values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      memoryId: memory.id,
      priority: 0,
    });

    serverAnalytics.track(PRODUCT_USAGE_ANALYTICS_EVENTS.memoryCreated, {
      status: "created",
      source: "project",
    });

    return [memory.id];
  });
}

export async function ensureDefaultNativeProjectMemoryForProject(
  projectId: string,
  database: DatabaseClient = db,
): Promise<string[]> {
  const [project] = await database
    .select({
      id: schema.projects.id,
      organizationId: schema.projects.organizationId,
      name: schema.projects.name,
      source: schema.projects.source,
      createdByUserId: schema.projects.createdByUserId,
    })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);

  if (!project || project.source !== "native") {
    return listAttachedProjectMemoryIds(projectId, database);
  }

  return ensureDefaultNativeProjectMemory({
    organizationId: project.organizationId,
    projectId: project.id,
    projectName: project.name,
    createdByUserId: project.createdByUserId,
    database,
  });
}
