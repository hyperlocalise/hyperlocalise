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

import { db, schema } from "@/lib/database";
import { loadLatestOrganizationProviderCredential } from "@/lib/providers/organization-language-model";

import type { SandboxByokCredential } from "./sandbox-llm";

export async function loadSandboxByokCredential(
  organizationId: string,
): Promise<SandboxByokCredential | null> {
  const loaded = await loadLatestOrganizationProviderCredential(organizationId);
  if (!loaded.ok) {
    throw new Error(loaded.message);
  }

  return loaded.credential;
}

export async function loadSandboxByokCredentialForJob(
  jobId: string,
): Promise<SandboxByokCredential | null> {
  const [job] = await db
    .select({ organizationId: schema.jobs.organizationId })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId))
    .limit(1);

  if (!job?.organizationId) {
    return null;
  }

  return loadSandboxByokCredential(job.organizationId);
}
