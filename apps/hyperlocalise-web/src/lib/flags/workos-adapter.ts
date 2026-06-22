import { getFeatureFlagsRuntimeClient } from "@workos-inc/authkit-nextjs";
import type { Adapter } from "flags";

import { getWorkosAuthKitConfig } from "@/lib/workos/config";

import type { WorkosFlagEntities } from "./workos-flag-entities";

const WORKOS_ADAPTER_ID = Symbol("workos-feature-flags");
const FEATURE_FLAGS_READY_TIMEOUT_MS = 2_000;

let defaultWorkosAdapter: ReturnType<typeof createWorkosAdapter> | undefined;
let featureFlagsReadyPromise: Promise<void> | undefined;

function isWorkosFeatureFlagsEnabled() {
  const config = getWorkosAuthKitConfig();
  return Boolean(config?.apiKey);
}

function waitForFeatureFlagsReady(
  client: ReturnType<typeof getFeatureFlagsRuntimeClient>,
): Promise<void> {
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
          const client = getFeatureFlagsRuntimeClient();
          await waitForFeatureFlagsReady(client);
          return client.isEnabled(key, {
            organizationId: context?.organization?.id,
            userId: context?.user?.id,
          }) as ValueType;
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
