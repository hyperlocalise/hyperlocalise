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
import { NotFoundException } from "@workos-inc/node";

import { db, schema } from "@/lib/database/client";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { getWorkosServerClient } from "@/lib/workos/server-client";

import type { PipesProviderSlug } from "./providers";
import type {
  PipesConnectionOwner,
  PipesConnectionStatus,
  PipesCredentialError,
  PipesOrganizationAccount,
  PipesStatusError,
} from "./types";

const PIPES_UNAVAILABLE: PipesStatusError = {
  code: "pipes_unavailable",
  message: "this provider isn't available right now. Contact support if this continues.",
};

const PIPES_NOT_CONNECTED: PipesCredentialError = {
  code: "pipes_not_connected",
  message: "Connect this provider in Integrations before using it.",
};

const PIPES_NEEDS_REAUTHORIZATION: PipesCredentialError = {
  code: "pipes_needs_reauthorization",
  message: "Reconnect this provider in Integrations, then try again.",
};

async function loadWorkosOrganizationId(
  localOrganizationId: string,
): Promise<Result<string, PipesStatusError>> {
  const [organization] = await db
    .select({ workosOrganizationId: schema.organizations.workosOrganizationId })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, localOrganizationId))
    .limit(1);

  if (!organization?.workosOrganizationId) {
    return err(PIPES_UNAVAILABLE);
  }

  return ok(organization.workosOrganizationId);
}

async function resolveWorkosOrganizationId(input: {
  localOrganizationId: string;
  workosOrganizationId?: string | null;
}): Promise<Result<string, PipesStatusError>> {
  const explicit = input.workosOrganizationId?.trim();
  if (explicit) {
    return ok(explicit);
  }
  return loadWorkosOrganizationId(input.localOrganizationId);
}

function isNotFound(error: unknown): boolean {
  return error instanceof NotFoundException;
}

export async function getPipesAccountStatus(input: {
  provider: PipesProviderSlug;
  localOrganizationId: string;
  workosUserId: string;
  workosOrganizationId?: string | null;
}): Promise<Result<PipesConnectionStatus, PipesStatusError>> {
  const workos = getWorkosServerClient();
  if (!workos) {
    return err(PIPES_UNAVAILABLE);
  }

  const organizationIdResult = await resolveWorkosOrganizationId({
    localOrganizationId: input.localOrganizationId,
    workosOrganizationId: input.workosOrganizationId,
  });
  if (isErr(organizationIdResult)) {
    return organizationIdResult;
  }

  try {
    const account = await workos.pipes.getUserConnectedAccount({
      slug: input.provider,
      userId: input.workosUserId,
      organizationId: organizationIdResult.value,
    });

    if (account.state === "needs_reauthorization") {
      return ok({
        connected: false,
        needsReauthorization: true,
        apiKeyLast4: account.apiKeyLast4 ?? null,
      });
    }

    if (account.state !== "connected") {
      return ok({
        connected: false,
        needsReauthorization: false,
        apiKeyLast4: account.apiKeyLast4 ?? null,
      });
    }

    return ok({
      connected: true,
      needsReauthorization: false,
      apiKeyLast4: account.apiKeyLast4 ?? null,
    });
  } catch (error) {
    if (isNotFound(error)) {
      return ok({
        connected: false,
        needsReauthorization: false,
        apiKeyLast4: null,
      });
    }

    return err(PIPES_UNAVAILABLE);
  }
}

export async function upsertPipesApiKey(input: {
  provider: PipesProviderSlug;
  localOrganizationId: string;
  workosUserId: string;
  workosOrganizationId?: string | null;
  secret: string;
}): Promise<Result<PipesConnectionStatus, PipesCredentialError>> {
  const secret = input.secret.trim();
  if (!secret) {
    return err(PIPES_NOT_CONNECTED);
  }

  const workos = getWorkosServerClient();
  if (!workos) {
    return err(PIPES_UNAVAILABLE);
  }

  const organizationIdResult = await resolveWorkosOrganizationId({
    localOrganizationId: input.localOrganizationId,
    workosOrganizationId: input.workosOrganizationId,
  });
  if (isErr(organizationIdResult)) {
    return organizationIdResult;
  }

  try {
    const account = await workos.pipes.updateDataIntegrationApiKey({
      slug: input.provider,
      userId: input.workosUserId,
      organizationId: organizationIdResult.value,
      secret,
    });

    if (account.state === "needs_reauthorization") {
      return err(PIPES_NEEDS_REAUTHORIZATION);
    }

    if (account.state !== "connected") {
      return err(PIPES_NOT_CONNECTED);
    }

    return ok({
      connected: true,
      needsReauthorization: false,
      apiKeyLast4: account.apiKeyLast4 ?? null,
    });
  } catch (error) {
    if (isNotFound(error)) {
      return err(PIPES_NOT_CONNECTED);
    }

    return err(PIPES_UNAVAILABLE);
  }
}

export async function loadPipesApiKey(input: {
  provider: PipesProviderSlug;
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<string, PipesCredentialError>> {
  const workos = getWorkosServerClient();
  if (!workos) {
    return err(PIPES_UNAVAILABLE);
  }

  const organizationIdResult = await loadWorkosOrganizationId(input.localOrganizationId);
  if (isErr(organizationIdResult)) {
    return organizationIdResult;
  }

  try {
    const result = await workos.pipes.createDataIntegrationCredential({
      slug: input.provider,
      userId: input.workosUserId,
      organizationId: organizationIdResult.value,
    });

    const apiKey = result.credential?.value?.trim();
    if (!apiKey || result.error) {
      if (result.error === "needs_reauthorization") {
        return err(PIPES_NEEDS_REAUTHORIZATION);
      }
      return err(PIPES_NOT_CONNECTED);
    }

    return ok(apiKey);
  } catch (error) {
    if (isNotFound(error)) {
      return err(PIPES_NOT_CONNECTED);
    }

    return err(PIPES_UNAVAILABLE);
  }
}

function pipesCredentialErrorFromVendError(error: unknown): PipesCredentialError {
  const code =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : null;

  if (code === "needs_reauthorization" || code === "reauthorization_needed") {
    return PIPES_NEEDS_REAUTHORIZATION;
  }

  return PIPES_NOT_CONNECTED;
}

export async function createPipesAuthorizeUrl(input: {
  provider: PipesProviderSlug;
  localOrganizationId: string;
  workosUserId: string;
  returnTo?: string;
  /**
   * `organization` connects one account shared by the whole workspace; the member authorizing
   * does not own it. The person's own account (`user`) otherwise.
   */
  connectionOwner?: PipesConnectionOwner;
}): Promise<Result<{ url: string }, PipesStatusError>> {
  const workos = getWorkosServerClient();
  if (!workos) {
    return err(PIPES_UNAVAILABLE);
  }

  const organizationIdResult = await loadWorkosOrganizationId(input.localOrganizationId);
  if (isErr(organizationIdResult)) {
    return organizationIdResult;
  }

  try {
    const result = await workos.pipes.authorizeDataIntegration({
      slug: input.provider,
      userId: input.workosUserId,
      organizationId: organizationIdResult.value,
      ...(input.connectionOwner === "organization" ? { connectionOwner: "organization" } : {}),
      ...(input.returnTo ? { returnTo: input.returnTo } : {}),
    });
    const url = result.url?.trim();
    if (!url) {
      return err(PIPES_UNAVAILABLE);
    }

    return ok({ url });
  } catch {
    return err(PIPES_UNAVAILABLE);
  }
}

export async function deletePipesConnectedAccount(input: {
  provider: PipesProviderSlug;
  localOrganizationId: string;
  workosUserId: string;
  /** `organization` removes the workspace's shared account; the person's own otherwise. */
  connectionOwner?: PipesConnectionOwner;
}): Promise<Result<void, PipesCredentialError>> {
  const workos = getWorkosServerClient();
  if (!workos) {
    return err(PIPES_UNAVAILABLE);
  }

  const organizationIdResult = await loadWorkosOrganizationId(input.localOrganizationId);
  if (isErr(organizationIdResult)) {
    return organizationIdResult;
  }

  try {
    if (input.connectionOwner === "organization") {
      await workos.pipes.deleteOrganizationConnectedAccount({
        slug: input.provider,
        organizationId: organizationIdResult.value,
      });
    } else {
      await workos.pipes.deleteUserConnectedAccount({
        slug: input.provider,
        userId: input.workosUserId,
        organizationId: organizationIdResult.value,
      });
    }
    return ok(undefined);
  } catch (error) {
    if (isNotFound(error)) {
      return err(PIPES_NOT_CONNECTED);
    }

    return err(PIPES_UNAVAILABLE);
  }
}

export async function loadPipesAccessToken(input: {
  provider: PipesProviderSlug;
  localOrganizationId: string;
  /** For `organization`, the member the token is issued on behalf of; they must still belong. */
  workosUserId: string;
  /** `organization` reads the workspace's shared account; the person's own otherwise. */
  connectionOwner?: PipesConnectionOwner;
}): Promise<Result<string, PipesCredentialError>> {
  const workos = getWorkosServerClient();
  if (!workos) {
    return err(PIPES_UNAVAILABLE);
  }

  const organizationIdResult = await loadWorkosOrganizationId(input.localOrganizationId);
  if (isErr(organizationIdResult)) {
    return organizationIdResult;
  }

  try {
    const result = await workos.pipes.getAccessToken({
      provider: input.provider,
      userId: input.workosUserId,
      organizationId: organizationIdResult.value,
      ...(input.connectionOwner === "organization" ? { connectionOwner: "organization" } : {}),
    });

    if (!result.active) {
      return err(pipesCredentialErrorFromVendError(result.error));
    }

    const accessToken = result.accessToken.accessToken.trim();
    if (!accessToken) {
      return err(PIPES_NOT_CONNECTED);
    }

    return ok(accessToken);
  } catch (error) {
    if (isNotFound(error)) {
      return err(PIPES_NOT_CONNECTED);
    }

    return err(PIPES_UNAVAILABLE);
  }
}

/**
 * The workspace's shared (organization-owned) account for a provider: whether it works, who
 * established it (the member tokens are issued on behalf of), and whether that member has left.
 */
export async function getPipesOrganizationAccount(input: {
  provider: PipesProviderSlug;
  localOrganizationId: string;
  workosOrganizationId?: string | null;
}): Promise<Result<PipesOrganizationAccount, PipesStatusError>> {
  const workos = getWorkosServerClient();
  if (!workos) {
    return err(PIPES_UNAVAILABLE);
  }

  const organizationIdResult = await resolveWorkosOrganizationId({
    localOrganizationId: input.localOrganizationId,
    workosOrganizationId: input.workosOrganizationId,
  });
  if (isErr(organizationIdResult)) {
    return organizationIdResult;
  }

  try {
    const account = await workos.pipes.getOrganizationConnectedAccount({
      slug: input.provider,
      organizationId: organizationIdResult.value,
    });
    const establisherLeft = account.stateReason === "establishing_member_membership_ended";
    return ok({
      connected: account.state === "connected" && Boolean(account.establishedByUserId),
      needsReauthorization: account.state === "needs_reauthorization" || establisherLeft,
      establisherLeft,
      establishedByWorkosUserId: account.establishedByUserId ?? null,
      accountName: account.accountDisplayName?.trim() || null,
    });
  } catch (error) {
    if (isNotFound(error)) {
      return ok({
        connected: false,
        needsReauthorization: false,
        establisherLeft: false,
        establishedByWorkosUserId: null,
        accountName: null,
      });
    }

    return err(PIPES_UNAVAILABLE);
  }
}
