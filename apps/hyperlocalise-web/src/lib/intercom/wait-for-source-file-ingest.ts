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

import { db, schema } from "@/lib/database/client";

const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Waits until the version's ingest has finished. `skipped` is finished too: a newer version of
 * the same file took over, so there is nothing more to wait for.
 */
export async function waitForSourceFileVersionIngest(input: {
  organizationId: string;
  sourceFileVersionId: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
}): Promise<"ingested" | "skipped" | "failed" | "timeout"> {
  const pollIntervalMs = input.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const [version] = await db
      .select({
        ingestState: schema.repositorySourceFileVersions.ingestState,
        ingestError: schema.repositorySourceFileVersions.ingestError,
      })
      .from(schema.repositorySourceFileVersions)
      .where(eq(schema.repositorySourceFileVersions.id, input.sourceFileVersionId))
      .limit(1);

    if (!version) {
      return "failed";
    }

    if (version.ingestState === "ingested") {
      return "ingested";
    }

    if (version.ingestState === "skipped") {
      return "skipped";
    }

    if (version.ingestState === "failed") {
      return "failed";
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return "timeout";
}
