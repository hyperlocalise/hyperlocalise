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
import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/database/client";
import {
  encryptProviderCredential,
  decryptProviderCredential,
  type EncryptedProviderCredential,
} from "@/lib/security/provider-credential-crypto";
export function encryptWorkflowPayload(value: unknown): Record<string, unknown> {
  const result = encryptProviderCredential(JSON.stringify(value));
  if (!result.ok) throw new Error("workflow_encryption_unavailable");
  return { ...result.value };
}
export function decryptWorkflowPayload(value: Record<string, unknown>): unknown {
  const result = decryptProviderCredential(value as EncryptedProviderCredential);
  if (!result.ok) throw new Error("workflow_decryption_failed");
  return JSON.parse(result.value);
}
export async function listWorkflowCredentials(organizationId: string) {
  return db
    .select({
      id: schema.visualWorkflowCredentials.id,
      name: schema.visualWorkflowCredentials.name,
      createdAt: schema.visualWorkflowCredentials.createdAt,
    })
    .from(schema.visualWorkflowCredentials)
    .where(eq(schema.visualWorkflowCredentials.organizationId, organizationId));
}
export async function createWorkflowCredential(
  organizationId: string,
  name: string,
  value: string,
) {
  const [record] = await db
    .insert(schema.visualWorkflowCredentials)
    .values({ organizationId, name, encryptedValue: encryptWorkflowPayload(value) })
    .returning({
      id: schema.visualWorkflowCredentials.id,
      name: schema.visualWorkflowCredentials.name,
    });
  return record;
}
export async function resolveWorkflowCredential(
  organizationId: string,
  credentialId: string,
): Promise<string> {
  const [record] = await db
    .select()
    .from(schema.visualWorkflowCredentials)
    .where(
      and(
        eq(schema.visualWorkflowCredentials.id, credentialId),
        eq(schema.visualWorkflowCredentials.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!record) throw new Error("workflow_credential_not_found");
  return decryptWorkflowPayload(record.encryptedValue) as string;
}
