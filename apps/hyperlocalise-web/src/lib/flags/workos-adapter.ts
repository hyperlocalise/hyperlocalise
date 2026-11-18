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
import { getFeatureFlagsRuntimeClient } from "@workos-inc/authkit-nextjs";
import type { Adapter } from "flags";

import { createLogger } from "@/lib/log";
import { getWorkosAuthKitConfig } from "@/lib/workos/config";

import type { WorkosFlagEntities } from "./workos-flag-entities";

const WORKOS_ADAPTER_ID = Symbol("workos-feature-flags");
const FEATURE_FLAGS_READY_TIMEOUT_MS = 2_000;

let defaultWorkosAdapter: ReturnType<typeof createWorkosAdapter> | undefined;
let featureFlagsReadyPromise: Promise<void> | undefined;
let featureFlagsErrorListenerAttached = false;

const logger = createLogger("workos-feature-flags");

/**
 * The shared WorkOS flags client, with an `error` listener attached. Without one the SDK warns on
 * stderr whenever a background poll fails. A poll that times out (often after a serverless
 * instance was frozen mid-request) reads as "Poll aborted" or "Request timed out"; the client keeps
 * its last good flags and retries, so those are logged at debug only.
 */
function getFeatureFlagsClient() {
  const client = getFeatureFlagsRuntimeClient();
  if (!featureFlagsErrorListenerAttached) {
    featureFlagsErrorListenerAttached = true;
    client.on("error", (error: Error) => {
      const timedOut = error.message === "Poll aborted" || error.message === "Request timed out";
      logger[timedOut ? "debug" : "warn"]("feature_flag_poll_failed", { error: error.name });
    });
  }
  return client;
}

function isWorkosFeatureFlagsEnabled() {
  const config = getWorkosAuthKitConfig();
  return Boolean(config?.apiKey);
}

function waitForFeatureFlagsReady(client: ReturnType<typeof getFeatureFlagsClient>): Promise<void> {
  if (!featureFlagsReadyPromise) {
    featureFlagsReadyPromise = client
      .waitUntilReady({ timeoutMs: FEATURE_FLAGS_READY_TIMEOUT_MS })
      .catch((error) => {
        featureFlagsReadyPromise = undefined;
        throw error;
      });
  }

  return featureFlagsReadyPromise;
}

export function createWorkosAdapter() {
  return function workosAdapter<ValueType, EntitiesType>(): Adapter<ValueType, EntitiesType> {
    return {
      adapterId: WORKOS_ADAPTER_ID,
      origin(key) {
        return `https://dashboard.workos.com/feature-flags/${key}`;
      },
      async decide({ key, entities }) {
        if (!isWorkosFeatureFlagsEnabled()) {
          return false as ValueType;
        }

        const context = entities as WorkosFlagEntities | undefined;

        try {
          const client = getFeatureFlagsClient();
          await waitForFeatureFlagsReady(client);
          return (await Promise.resolve(
            client.isEnabled(key, {
              organizationId: context?.organization?.id,
              userId: context?.user?.id,
            }),
          )) as ValueType;
        } catch {
          return false as ValueType;
        }
      },
    };
  };
}

export function workosAdapter<ValueType, EntitiesType>(): Adapter<ValueType, EntitiesType> {
  if (!defaultWorkosAdapter) {
    defaultWorkosAdapter = createWorkosAdapter();
  }

  return defaultWorkosAdapter<ValueType, EntitiesType>();
}

/**
 * Waits for this instance's first download of WorkOS feature flags. Once it resolves, a flag check
 * answers from downloaded WorkOS data rather than from the `false` the adapter returns while
 * nothing has been downloaded, so background work can tell "off" from "not known yet". Rejects
 * when the flags cannot be downloaded within `timeoutMs`. Resolves to `false` when WorkOS flags
 * are not configured, where every flag reads as off.
 */
export async function waitForWorkosFeatureFlags(options: { timeoutMs: number }): Promise<boolean> {
  if (!isWorkosFeatureFlagsEnabled()) {
    return false;
  }

  await getFeatureFlagsClient().waitUntilReady({ timeoutMs: options.timeoutMs });
  return true;
}

/**
 * Checks one flag straight from the WorkOS client, for background work that must tell "off" from
 * "could not check": unlike the adapter, which answers false on any error, it lets a failure
 * through. Call it only after `waitForWorkosFeatureFlags` resolved to `true`; it does not wait.
 */
export async function readWorkosFeatureFlag(
  key: string,
  entities: WorkosFlagEntities,
): Promise<boolean> {
  const enabled = await Promise.resolve(
    getFeatureFlagsClient().isEnabled(key, {
      organizationId: entities.organization?.id,
      userId: entities.user?.id,
    }),
  );
  return enabled === true;
}
