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
import {
  createPipesAuthorizeUrl,
  deletePipesConnectedAccount,
  getPipesOrganizationAccount,
  loadPipesAccessToken,
} from "@/lib/pipes/accounts";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { BITBUCKET_PIPES_SLUG } from "./constants";
import type { BitbucketAccess, BitbucketApiError, BitbucketConnectionStatus } from "./types";

const BITBUCKET_UNAVAILABLE: BitbucketApiError = {
  code: "bitbucket_unavailable",
  message: "Bitbucket isn't available right now. Contact support if this continues.",
};

const BITBUCKET_NOT_CONNECTED: BitbucketApiError = {
  code: "bitbucket_not_connected",
  message: "Connect Bitbucket in Integrations before syncing.",
};

const BITBUCKET_NEEDS_RECONNECT: BitbucketApiError = {
  code: "bitbucket_needs_reconnect",
  message: "Reconnect Bitbucket in Integrations, then try again.",
};

const BITBUCKET_CONNECTOR_LEFT: BitbucketApiError = {
  code: "bitbucket_needs_reconnect",
  message:
    "The admin who connected Bitbucket has left this workspace. An admin needs to connect Bitbucket again in Integrations.",
};

/** The workspace's one shared Bitbucket connection. */
export async function getBitbucketConnectionStatus(input: {
  localOrganizationId: string;
  workosOrganizationId?: string | null;
}): Promise<Result<BitbucketConnectionStatus, BitbucketApiError>> {
  const account = await getPipesOrganizationAccount({
    provider: BITBUCKET_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosOrganizationId: input.workosOrganizationId,
  });
  if (isErr(account)) {
    return err(BITBUCKET_UNAVAILABLE);
  }
  return ok({
    connected: account.value.connected,
    needsReconnect: account.value.needsReauthorization,
    connectorLeft: account.value.establisherLeft,
    accountName: account.value.accountName,
  });
}

/**
 * A token for the workspace's Bitbucket connection, for runs with nobody signed in. WorkOS issues
 * organization tokens on behalf of a member, so it is the admin who connected Bitbucket.
 */
export async function loadBitbucketAccess(input: {
  localOrganizationId: string;
}): Promise<Result<BitbucketAccess, BitbucketApiError>> {
  const account = await getPipesOrganizationAccount({
    provider: BITBUCKET_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
  });
  if (isErr(account)) {
    return err(BITBUCKET_UNAVAILABLE);
  }
  if (account.value.establisherLeft) {
    return err(BITBUCKET_CONNECTOR_LEFT);
  }
  if (account.value.needsReauthorization) {
    return err(BITBUCKET_NEEDS_RECONNECT);
  }
  const establisher = account.value.establishedByWorkosUserId;
  if (!account.value.connected || !establisher) {
    return err(BITBUCKET_NOT_CONNECTED);
  }
  const token = await loadPipesAccessToken({
    provider: BITBUCKET_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: establisher,
    connectionOwner: "organization",
  });
  if (isErr(token)) {
    return err(
      token.error.code === "pipes_needs_reauthorization"
        ? BITBUCKET_NEEDS_RECONNECT
        : token.error.code === "pipes_not_connected"
          ? BITBUCKET_NOT_CONNECTED
          : BITBUCKET_UNAVAILABLE,
    );
  }
  return ok({ accessToken: token.value });
}

/**
 * Who a Bitbucket clone's credentials belong to: the admin who connected Bitbucket. A repository
 * sandbox made under one connection is not reused under another. Null when it can't be used.
 */
export async function resolveBitbucketCredentialOwner(input: {
  localOrganizationId: string;
}): Promise<string | null> {
  const account = await getPipesOrganizationAccount({
    provider: BITBUCKET_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
  });
  if (isErr(account)) {
    return null;
  }
  const { connected, needsReauthorization, establisherLeft, establishedByWorkosUserId } =
    account.value;
  if (!connected || needsReauthorization || establisherLeft || !establishedByWorkosUserId) {
    return null;
  }
  return `bitbucket-connection:${establishedByWorkosUserId}`;
}

/** Where an admin signs in to connect Bitbucket for the whole workspace. */
export async function createBitbucketAuthorizeUrl(input: {
  localOrganizationId: string;
  workosUserId: string;
  returnTo?: string;
}): Promise<Result<{ url: string }, BitbucketApiError>> {
  const result = await createPipesAuthorizeUrl({
    provider: BITBUCKET_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
    connectionOwner: "organization",
    ...(input.returnTo ? { returnTo: input.returnTo } : {}),
  });
  return isErr(result) ? err(BITBUCKET_UNAVAILABLE) : result;
}

/** Removes the workspace's Bitbucket connection; already gone counts as done. */
export async function disconnectBitbucket(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<void, BitbucketApiError>> {
  const result = await deletePipesConnectedAccount({
    provider: BITBUCKET_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
    connectionOwner: "organization",
  });
  if (isErr(result) && result.error.code !== "pipes_not_connected") {
    return err(BITBUCKET_UNAVAILABLE);
  }
  return ok(undefined);
}
