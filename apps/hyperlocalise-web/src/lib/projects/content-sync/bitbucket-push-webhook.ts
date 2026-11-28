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
import type { ContentSyncConfig } from "@/lib/agents/content-sync/content-sync-types";
import { loadBitbucketAccess } from "@/lib/bitbucket/pipes";
import {
  bitbucketWebhookSecret,
  bitbucketWebhookUrl,
  deleteBitbucketWebhook,
  registerBitbucketPushWebhook,
} from "@/lib/bitbucket/webhooks";
import { createLogger } from "@/lib/log";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

const logger = createLogger("bitbucket-push-webhook");

export type BitbucketPushWebhookError = {
  code: "content_sync_bitbucket_webhook_failed";
  message: string;
};

type Hook = { fullName: string; webhookId: string };

function savedHook(config: ContentSyncConfig | null): Hook | null {
  return config?.provider === "bitbucket" && config.bitbucketWebhookId
    ? { fullName: config.resourceKey, webhookId: config.bitbucketWebhookId }
    : null;
}

/**
 * Keeps a project's Bitbucket push webhook in step with its sync settings: adds one when Sync on
 * push is turned on or the repository changes, removes the old one when it no longer applies, and
 * answers the settings to save with the webhook's id. A webhook Bitbucket refuses to add fails the
 * save; one that can't be removed is logged and left, since its deliveries are ignored anyway.
 */
export async function reconcileBitbucketPushWebhook(input: {
  organizationId: string;
  projectId: string;
  /** The saved settings, or null for a new sync. */
  previous: ContentSyncConfig | null;
  /** The settings being saved, or null when the sync is removed. */
  next: ContentSyncConfig | null;
  /** The app's public origin, which Bitbucket delivers to. */
  origin: string;
}): Promise<Result<ContentSyncConfig | null, BitbucketPushWebhookError>> {
  const previous = savedHook(input.previous);
  const wanted = input.next?.provider === "bitbucket" && input.next.syncOnPush === true;
  const keep =
    wanted &&
    previous !== null &&
    previous.fullName.toLowerCase() === input.next!.resourceKey.toLowerCase();

  // The client never chooses the webhook: only what this function decides is saved.
  let next: ContentSyncConfig | null = input.next
    ? { ...input.next, bitbucketWebhookId: undefined }
    : null;
  if (next && keep) {
    next = { ...next, bitbucketWebhookId: previous!.webhookId };
  }
  if (!wanted && !previous) {
    return ok(next);
  }

  const access = await loadBitbucketAccess({ localOrganizationId: input.organizationId });
  if (wanted && !keep) {
    if (isErr(access)) {
      return err({ code: "content_sync_bitbucket_webhook_failed", message: access.error.message });
    }
    const registered = await registerBitbucketPushWebhook({
      ...access.value,
      fullName: input.next!.resourceKey,
      url: bitbucketWebhookUrl(input.origin, input.projectId),
      secret: bitbucketWebhookSecret(input.projectId),
    });
    if (isErr(registered)) {
      logger.warn(
        { projectId: input.projectId, code: registered.error.code },
        "bitbucket refused the push webhook",
      );
      return err({
        code: "content_sync_bitbucket_webhook_failed",
        message:
          registered.error.code === "bitbucket_forbidden" ||
          registered.error.code === "bitbucket_unauthorized"
            ? "Bitbucket didn't let Hyperlocalise add a push webhook: the connected Bitbucket account needs admin access to this repository. Turn off Sync on push, or connect an account with admin access."
            : "Bitbucket couldn't add the push webhook just now. Try again, or turn off Sync on push.",
      });
    }
    next = { ...next!, bitbucketWebhookId: registered.value };
  }

  if (previous && !keep) {
    const removed = isErr(access)
      ? access
      : await deleteBitbucketWebhook({ ...access.value, ...previous });
    if (isErr(removed)) {
      logger.warn(
        { projectId: input.projectId, code: removed.error.code },
        "bitbucket push webhook could not be removed",
      );
    }
  }
  return ok(next);
}
