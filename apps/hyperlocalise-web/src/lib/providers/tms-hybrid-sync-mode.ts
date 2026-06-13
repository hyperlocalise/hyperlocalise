import { env } from "@/lib/env";

/**
 * When enabled, external TMS projects are mirrored in the background via
 * provider sync intents while list endpoints read from the local database.
 */
export function isTmsHybridSyncEnabled() {
  return env.NEXT_PUBLIC_TMS_HYBRID_SYNC_ENABLED;
}
