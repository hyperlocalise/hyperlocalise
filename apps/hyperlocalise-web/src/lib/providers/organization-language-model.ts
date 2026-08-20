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
import { desc, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { LlmProvider } from "@/lib/database/types";
import {
  getManagedLanguageModel,
  hyperlocaliseManagedGatewayModelId,
  resolveProviderLanguageModel,
  type ResolvedAgentLanguageModel,
} from "@/lib/providers/language-model";
import {
  decryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";

export type LoadedOrganizationProviderCredential =
  | {
      ok: true;
      credential: {
        provider: LlmProvider;
        apiKey: string;
        model: string;
      } | null;
    }
  | {
      ok: false;
      code: "provider_credential_invalid";
      message: string;
    };

export async function loadLatestOrganizationProviderCredential(
  organizationId: string,
): Promise<LoadedOrganizationProviderCredential> {
  const [credential] = await db
    .select({
      provider: schema.organizationLlmProviderCredentials.provider,
      defaultModel: schema.organizationLlmProviderCredentials.defaultModel,
      encryptionAlgorithm: schema.organizationLlmProviderCredentials.encryptionAlgorithm,
      ciphertext: schema.organizationLlmProviderCredentials.ciphertext,
      iv: schema.organizationLlmProviderCredentials.iv,
      authTag: schema.organizationLlmProviderCredentials.authTag,
      keyVersion: schema.organizationLlmProviderCredentials.keyVersion,
    })
    .from(schema.organizationLlmProviderCredentials)
    .where(eq(schema.organizationLlmProviderCredentials.organizationId, organizationId))
    .orderBy(desc(schema.organizationLlmProviderCredentials.updatedAt))
    .limit(1);

  if (!credential) {
    return { ok: true, credential: null };
  }

  if (
    !credential.defaultModel ||
    !credential.encryptionAlgorithm ||
    !credential.ciphertext ||
    !credential.iv ||
    !credential.authTag ||
    credential.keyVersion === null
  ) {
    return {
      ok: false,
      code: "provider_credential_invalid",
      message: "organization provider credential is incomplete",
    };
  }

  const apiKey = unwrapProviderCredentialCrypto(
    decryptProviderCredential({
      algorithm: credential.encryptionAlgorithm,
      keyVersion: credential.keyVersion,
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      authTag: credential.authTag,
    }),
  );

  return {
    ok: true,
    credential: {
      provider: credential.provider,
      apiKey,
      model: credential.defaultModel,
    },
  };
}

export async function resolveHyperlocaliseAgentLanguageModel(input?: {
  organizationId?: string;
}): Promise<ResolvedAgentLanguageModel> {
  if (input?.organizationId) {
    const loaded = await loadLatestOrganizationProviderCredential(input.organizationId);
    if (!loaded.ok) {
      throw new Error(loaded.message);
    }

    if (loaded.credential) {
      return {
        model: resolveProviderLanguageModel({
          provider: loaded.credential.provider,
          apiKey: loaded.credential.apiKey,
          model: loaded.credential.model,
        }),
        source: loaded.credential.provider,
        modelId: loaded.credential.model,
      };
    }
  }

  return {
    model: getManagedLanguageModel(),
    source: "gateway",
    modelId: hyperlocaliseManagedGatewayModelId,
  };
}
