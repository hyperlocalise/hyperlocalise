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
import {
  decryptProviderCredential,
  encryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";

export type CrowdinAppInstalledEvent = {
  appId: string;
  appSecret: string;
  domain?: string | null;
  organizationId: number | string;
  userId: number | string;
  baseUrl: string;
};

export type CrowdinAppUninstallEvent = {
  domain?: string | null;
  organizationId: number | string;
};

function parsePositiveInt(value: number | string) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }
  return null;
}

export async function upsertCrowdinAppInstallation(event: CrowdinAppInstalledEvent) {
  const crowdinOrganizationId = parsePositiveInt(event.organizationId);
  const crowdinUserId = parsePositiveInt(event.userId);
  if (!crowdinOrganizationId || !crowdinUserId) {
    throw new Error("invalid_crowdin_app_install_payload");
  }

  const encrypted = unwrapProviderCredentialCrypto(encryptProviderCredential(event.appSecret));

  const [linkedCredential] = await db
    .select({
      organizationId: schema.organizationExternalTmsProviderCredentials.organizationId,
    })
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      eq(
        schema.organizationExternalTmsProviderCredentials.externalOrganizationId,
        String(crowdinOrganizationId),
      ),
    )
    .limit(1);

  const values = {
    crowdinOrganizationId,
    crowdinDomain: event.domain ?? null,
    crowdinBaseUrl: event.baseUrl,
    crowdinUserId,
    appId: event.appId,
    appSecretEncryptionAlgorithm: encrypted.algorithm,
    appSecretCiphertext: encrypted.ciphertext,
    appSecretIv: encrypted.iv,
    appSecretAuthTag: encrypted.authTag,
    appSecretKeyVersion: encrypted.keyVersion,
    organizationId: linkedCredential?.organizationId ?? null,
    updatedAt: new Date(),
  };

  const [existing] = await db
    .select({ id: schema.crowdinAppInstallations.id })
    .from(schema.crowdinAppInstallations)
    .where(eq(schema.crowdinAppInstallations.crowdinOrganizationId, crowdinOrganizationId))
    .limit(1);

  if (existing) {
    await db
      .update(schema.crowdinAppInstallations)
      .set(values)
      .where(eq(schema.crowdinAppInstallations.id, existing.id));
    return existing.id;
  }

  const [created] = await db
    .insert(schema.crowdinAppInstallations)
    .values(values)
    .returning({ id: schema.crowdinAppInstallations.id });

  return created!.id;
}

export async function deleteCrowdinAppInstallation(event: CrowdinAppUninstallEvent) {
  const crowdinOrganizationId = parsePositiveInt(event.organizationId);
  if (!crowdinOrganizationId) {
    throw new Error("invalid_crowdin_app_uninstall_payload");
  }

  await db
    .delete(schema.crowdinAppInstallations)
    .where(eq(schema.crowdinAppInstallations.crowdinOrganizationId, crowdinOrganizationId));
}

export async function getCrowdinAppInstallationSecret(crowdinOrganizationId: number) {
  const [row] = await db
    .select()
    .from(schema.crowdinAppInstallations)
    .where(eq(schema.crowdinAppInstallations.crowdinOrganizationId, crowdinOrganizationId))
    .limit(1);

  if (!row) {
    return null;
  }

  return unwrapProviderCredentialCrypto(
    decryptProviderCredential({
      algorithm: row.appSecretEncryptionAlgorithm,
      ciphertext: row.appSecretCiphertext,
      iv: row.appSecretIv,
      authTag: row.appSecretAuthTag,
      keyVersion: row.appSecretKeyVersion,
    }),
  );
}
