import { getFeatureFlagsRuntimeClient } from "@workos-inc/authkit-nextjs";
import type { Adapter } from "flags";

import { getWorkosAuthKitConfig } from "@/lib/workos/config";

import type { WorkosFlagEntities } from "./workos-flag-entities";

const WORKOS_ADAPTER_ID = Symbol("workos-feature-flags");

let defaultWorkosAdapter: ReturnType<typeof createWorkosAdapter> | undefined;

function isWorkosFeatureFlagsEnabled() {
  const config = getWorkosAuthKitConfig();
  return Boolean(config?.apiKey);
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
          await client.waitUntilReady({ timeoutMs: 5_000 });
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
