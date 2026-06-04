import { env } from "@/lib/env";

/**
 * Provider shell phase: Hyperlocalise reads TMS data live via API.
 */
export function isTmsProviderShellModeEnabled() {
  return env.NEXT_PUBLIC_TMS_PROVIDER_SHELL_MODE;
}
