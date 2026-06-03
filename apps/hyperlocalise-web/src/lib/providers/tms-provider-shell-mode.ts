/**
 * Provider shell phase: Hyperlocalise reads TMS data live via API.
 * Background sync, webhooks, and scheduled reconciliation stay off until
 * native + provider convergence is ready.
 */
export function isTmsProviderShellModeEnabled() {
  if (process.env.TMS_PROVIDER_SHELL_MODE === "false") {
    return false;
  }

  return true;
}

export function isTmsBackgroundSyncEnabled() {
  return !isTmsProviderShellModeEnabled();
}

export const TMS_PROVIDER_SHELL_BACKGROUND_SYNC_DISABLED_REASON =
  "Background TMS sync is disabled while provider shell mode is enabled.";
