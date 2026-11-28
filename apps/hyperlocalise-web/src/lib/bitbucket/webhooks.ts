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
import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { asRecord, bitbucketJson, bitbucketRepositoryPath } from "./client";
import type { BitbucketAccess, BitbucketApiError } from "./types";

/** Bitbucket's event key for a push to any branch. */
export const BITBUCKET_PUSH_EVENT = "repo:push";

const WEBHOOK_DESCRIPTION = "Hyperlocalise content sync";

/**
 * The secret Bitbucket signs a project's push webhook with. Derived from the server key and the
 * project, so nothing is stored and one project's secret never verifies another's deliveries.
 */
export function bitbucketWebhookSecret(projectId: string): string {
  return createHmac("sha256", env.PROVIDER_CREDENTIALS_MASTER_KEY)
    .update(`bitbucket-content-sync-webhook:${projectId}`)
    .digest("hex");
}

/** Where Bitbucket delivers a project's push events. */
export function bitbucketWebhookUrl(origin: string, projectId: string): string {
  return `${origin}/api/webhooks/bitbucket/content-sync/${encodeURIComponent(projectId)}`;
}

/** Checks Bitbucket's `X-Hub-Signature` (`sha256=<hex>`) over the raw body, in constant time. */
export function verifyBitbucketSignature(input: {
  body: string;
  signature: string | undefined;
  secret: string;
}): boolean {
  const match = /^sha256=([0-9a-f]{64})$/i.exec(input.signature?.trim() ?? "");
  if (!match) {
    return false;
  }
  const expected = createHmac("sha256", input.secret).update(input.body).digest();
  const received = Buffer.from(match[1]!, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** The branches a push payload moved, deleted branches and tags left out. */
export function bitbucketPushedBranches(payload: unknown): string[] {
  const changes = asRecord(asRecord(payload)?.push)?.changes;
  if (!Array.isArray(changes)) {
    return [];
  }
  return changes
    .map((change) => asRecord(asRecord(change)?.new))
    .filter((target) => target?.type === "branch" && typeof target.name === "string")
    .map((target) => target!.name as string);
}

/** The repository uuid a payload names, with its braces. */
export function bitbucketPayloadRepositoryUuid(payload: unknown): string | null {
  const uuid = asRecord(asRecord(payload)?.repository)?.uuid;
  return typeof uuid === "string" ? uuid : null;
}

/** Adds a push webhook to the repository; answers its uuid. Needs admin access to the repository. */
export async function registerBitbucketPushWebhook(
  input: BitbucketAccess & { fullName: string; url: string; secret: string; signal?: AbortSignal },
): Promise<Result<string, BitbucketApiError>> {
  const result = await bitbucketJson({
    accessToken: input.accessToken,
    signal: input.signal,
    method: "POST",
    path: `${bitbucketRepositoryPath(input.fullName)}/hooks`,
    body: {
      description: WEBHOOK_DESCRIPTION,
      url: input.url,
      active: true,
      events: [BITBUCKET_PUSH_EVENT],
      secret: input.secret,
    },
  });
  if (isErr(result)) {
    return result;
  }
  const uuid = asRecord(result.value)?.uuid;
  return typeof uuid === "string" && uuid
    ? ok(uuid)
    : err({ code: "bitbucket_request_failed", message: "Bitbucket request failed.", status: 200 });
}

/** Removes a webhook; one already gone counts as removed. */
export async function deleteBitbucketWebhook(
  input: BitbucketAccess & { fullName: string; webhookId: string; signal?: AbortSignal },
): Promise<Result<void, BitbucketApiError>> {
  const result = await bitbucketJson({
    accessToken: input.accessToken,
    signal: input.signal,
    method: "DELETE",
    path: `${bitbucketRepositoryPath(input.fullName)}/hooks/${encodeURIComponent(input.webhookId)}`,
  });
  if (isErr(result) && result.error.code !== "bitbucket_not_found") {
    return result;
  }
  return ok(undefined);
}
