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
import { z } from "zod";

import { err, fromThrowableAsync, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { readBoundedResponseBody, withPublicHttpFetch } from "@/lib/security/public-http-fetch";

const mcpClientMetadataDocumentSchema = z.object({
  client_id: z.url().max(2048),
  client_name: z.string().trim().min(1).max(128),
  client_uri: z.url().max(2048).optional(),
  logo_uri: z.url().max(2048).optional(),
  redirect_uris: z.array(z.url().max(2048)).min(1).max(10),
  grant_types: z.array(z.string().max(32)).optional(),
  response_types: z.array(z.string().max(32)).optional(),
  token_endpoint_auth_method: z.string().max(64).optional(),
});

export type ResolvedMcpClientMetadata = {
  clientId: string;
  clientName: string;
  redirectUris: string[];
};

export type McpClientMetadataError =
  | { code: "invalid_client_metadata" }
  | { code: "client_id_mismatch" }
  | { code: "redirect_uri_mismatch" }
  | { code: "invalid_client_id" }
  | { code: "metadata_fetch_failed" };

type ResolveMcpClientMetadataDependencies = {
  fetchDocument: (url: string) => Promise<unknown>;
};

function isHttpsClientId(clientId: string): boolean {
  try {
    const url = new URL(clientId);

    return (
      url.protocol === "https:" &&
      url.pathname !== "/" &&
      !url.username &&
      !url.password &&
      !url.hash
    );
  } catch {
    return false;
  }
}

const MAX_CLIENT_METADATA_BYTES = 5 * 1024;
const CLIENT_METADATA_FETCH_TIMEOUT_MS = 5_000;

function isJsonContentType(contentType: string | null): boolean {
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();

  return (
    mediaType === "application/json" ||
    (mediaType?.startsWith("application/") === true && mediaType.endsWith("+json"))
  );
}

export async function fetchMcpClientMetadataDocument(clientId: string): Promise<unknown> {
  return withPublicHttpFetch(
    clientId,
    {
      method: "GET",
      redirect: "error",
      headers: {
        Accept: "application/json, application/*+json",
      },
      signal: AbortSignal.timeout(CLIENT_METADATA_FETCH_TIMEOUT_MS),
    },
    async (response) => {
      if (!response.ok) {
        throw new Error("Client metadata request failed");
      }

      if (!isJsonContentType(response.headers.get("content-type"))) {
        throw new Error("Client metadata response must be JSON");
      }

      const body = await readBoundedResponseBody(response, MAX_CLIENT_METADATA_BYTES);

      return JSON.parse(new TextDecoder().decode(body)) as unknown;
    },
    {
      maxResponseSize: MAX_CLIENT_METADATA_BYTES,
    },
  );
}

export async function resolveMcpClientMetadata(
  input: {
    clientId: string;
    redirectUri: string;
  },
  dependencies: ResolveMcpClientMetadataDependencies = {
    fetchDocument: fetchMcpClientMetadataDocument,
  },
): Promise<Result<ResolvedMcpClientMetadata, McpClientMetadataError>> {
  if (!isHttpsClientId(input.clientId)) {
    return err({ code: "invalid_client_id" });
  }
  const documentResult = await fromThrowableAsync(dependencies.fetchDocument(input.clientId));

  if (isErr(documentResult)) {
    return err({ code: "metadata_fetch_failed" });
  }

  const parsed = mcpClientMetadataDocumentSchema.safeParse(documentResult.value);

  if (!parsed.success) {
    return err({ code: "invalid_client_metadata" });
  }

  if (parsed.data.client_id !== input.clientId) {
    return err({ code: "client_id_mismatch" });
  }

  if (!parsed.data.redirect_uris.includes(input.redirectUri)) {
    return err({ code: "redirect_uri_mismatch" });
  }

  return ok({
    clientId: parsed.data.client_id,
    clientName: parsed.data.client_name,
    redirectUris: parsed.data.redirect_uris,
  });
}
