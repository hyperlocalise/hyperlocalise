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
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { normalizeContentSyncConfig } from "@/lib/agents/content-sync/content-sync-types";
import { getBitbucketRepository } from "@/lib/bitbucket/client";
import { loadBitbucketAccess } from "@/lib/bitbucket/pipes";
import {
  BITBUCKET_PUSH_EVENT,
  bitbucketPayloadRepositoryUuid,
  bitbucketPushedBranches,
  bitbucketWebhookSecret,
  verifyBitbucketSignature,
} from "@/lib/bitbucket/webhooks";
import { db, schema } from "@/lib/database/client";
import { createLogger } from "@/lib/log";
import { isErr } from "@/lib/primitives/result/results";
import { safeJsonParse } from "@/lib/primitives/safeJsonParse/safeJsonParse";
import { startProjectContentSyncRun } from "@/lib/projects/content-sync/project-content-sync";
import type { ProjectContentSyncQueue } from "@/lib/workflow/types";
import { createProjectContentSyncQueue } from "@/workflows/adapters";

const logger = createLogger("bitbucket-webhook");

/**
 * Push events from the webhook a Bitbucket project sync registers on its repository. A push to
 * the branch the sync reads starts a run. Answers are kept plain so they say nothing to anyone
 * probing the address, and a delivery that isn't for a run is acknowledged so Bitbucket stops
 * retrying it.
 */
export function createBitbucketWebhookRoutes(
  options: { projectContentSyncQueue?: ProjectContentSyncQueue } = {},
) {
  return new Hono().post(
    "/content-sync/:projectId",
    bodyLimit({
      maxSize: 1024 * 1024,
      onError: (c) => c.json({ error: "payload_too_large" }, 413),
    }),
    async (c) => {
      const projectId = c.req.param("projectId");
      const event = c.req.header("x-event-key");
      const delivery = c.req.header("x-request-uuid");
      const log = logger.child({ delivery, event, projectId });
      const body = new TextDecoder().decode(await c.req.raw.arrayBuffer());

      if (
        !verifyBitbucketSignature({
          body,
          signature: c.req.header("x-hub-signature"),
          secret: bitbucketWebhookSecret(projectId),
        })
      ) {
        log.warn("bitbucket webhook signature did not verify");
        return c.json({ error: "invalid_signature" }, 401);
      }
      if (event !== BITBUCKET_PUSH_EVENT) {
        return c.body(null, 204);
      }
      const payload = safeJsonParse(body);
      if (isErr(payload)) {
        return c.json({ error: "invalid_payload" }, 400);
      }

      const [sync] = await db
        .select()
        .from(schema.projectContentSyncs)
        .where(eq(schema.projectContentSyncs.projectId, projectId))
        .limit(1);
      const config = sync ? normalizeContentSyncConfig(sync.syncConfig) : null;
      if (
        !sync ||
        !config ||
        config.provider !== "bitbucket" ||
        config.syncOnPush !== true ||
        bitbucketPayloadRepositoryUuid(payload.value) !== config.connectionId
      ) {
        log.info("bitbucket push ignored: no sync on push for this repository");
        return c.body(null, 204);
      }

      // The sync reads its branch, else the repository's main branch, which a push doesn't name.
      let branch = config.branch?.trim() ?? "";
      if (!branch) {
        const access = await loadBitbucketAccess({ localOrganizationId: sync.organizationId });
        const repository = isErr(access)
          ? access
          : await getBitbucketRepository({ ...access.value, fullName: config.resourceKey });
        if (isErr(repository) || !repository.value.mainBranch) {
          log.warn("bitbucket push ignored: the main branch could not be read");
          return c.body(null, 204);
        }
        branch = repository.value.mainBranch;
      }
      if (!bitbucketPushedBranches(payload.value).includes(branch)) {
        return c.body(null, 204);
      }

      const started = await startProjectContentSyncRun({
        sync,
        trigger: "push",
        userId: null,
        queue: options.projectContentSyncQueue ?? createProjectContentSyncQueue(),
      });
      if (isErr(started)) {
        // A run already going will read the branch as it is now.
        log.info("bitbucket push while a sync is running; not queued again");
        return c.body(null, 202);
      }
      log.info({ runId: started.value.id }, "bitbucket push started a content sync run");
      return c.body(null, 202);
    },
  );
}
