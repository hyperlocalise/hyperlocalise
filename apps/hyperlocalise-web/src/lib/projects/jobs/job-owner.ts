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
import { and, eq } from "drizzle-orm";

import { isVendorRole } from "@/api/auth/vendor-access";
import { db, schema, type DatabaseClient } from "@/lib/database/client";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import { isActiveOrganizationMembership } from "@/lib/workos/constants";

/**
 * Who a job can be given to.
 *
 * A post-edit or proofread task on a file can be given to any active member of the workspace,
 * a vendor included, whatever team the project is in: its owner reaches it through the task
 * itself (`task-access.ts`). Every other job keeps the rule its caller had, and can never be
 * given to a vendor, because nothing would let a vendor open or finish it.
 *
 * Keep in step with `assignableJobOwner` in apps/public-api/jobs-store.go.
 */
export const VENDOR_OWNER_NOT_ALLOWED_MESSAGE =
  "A vendor can only be given a post-edit or proofread task on a file.";

export type VendorOwnerNotAllowedError = {
  code: "vendor_owner_not_allowed";
  message: string;
};

/** The file a job's saved input names, or null for a job on chosen strings. */
export function readJobSourceFileId(inputPayload: unknown): string | null {
  if (!inputPayload || typeof inputPayload !== "object" || Array.isArray(inputPayload)) {
    return null;
  }
  const sourceFileId = (inputPayload as Record<string, unknown>).sourceFileId;
  return typeof sourceFileId === "string" && sourceFileId.length > 0 ? sourceFileId : null;
}

/**
 * A post-edit or proofread task on one file. Both are stored as proofread jobs; a job mirrored
 * from a provider is not one.
 */
export function isFileTaskForPeople(job: {
  kind: string;
  sourceFileId: string | null | undefined;
  isProviderJob?: boolean;
}): boolean {
  return job.kind === "proofread" && Boolean(job.sourceFileId) && !job.isProviderJob;
}

async function findWorkspaceMembership(input: {
  organizationId: string;
  userId: string;
  database: DatabaseClient;
}) {
  const [membership] = await input.database
    .select({
      role: schema.organizationMemberships.role,
      workosMembershipId: schema.organizationMemberships.workosMembershipId,
    })
    .from(schema.organizationMemberships)
    .where(
      and(
        eq(schema.organizationMemberships.organizationId, input.organizationId),
        eq(schema.organizationMemberships.userId, input.userId),
      ),
    )
    .limit(1);
  return membership ?? null;
}

/** Whether the person is a member whose membership is active (not a pending invitation). */
export async function isActiveWorkspaceMember(input: {
  organizationId: string;
  userId: string;
  database?: DatabaseClient;
}): Promise<boolean> {
  const membership = await findWorkspaceMembership({ ...input, database: input.database ?? db });
  return Boolean(membership && isActiveOrganizationMembership(membership.workosMembershipId));
}

/** Refuses a vendor as the owner of anything but a post-edit or proofread task on a file. */
export async function refuseVendorOwnerUnlessFileTask(input: {
  organizationId: string;
  ownerUserId: string;
  fileTask: boolean;
  database?: DatabaseClient;
}): Promise<Result<void, VendorOwnerNotAllowedError>> {
  if (input.fileTask) {
    return ok(undefined);
  }
  const membership = await findWorkspaceMembership({
    organizationId: input.organizationId,
    userId: input.ownerUserId,
    database: input.database ?? db,
  });
  if (membership && isVendorRole(membership.role)) {
    return err({ code: "vendor_owner_not_allowed", message: VENDOR_OWNER_NOT_ALLOWED_MESSAGE });
  }
  return ok(undefined);
}
