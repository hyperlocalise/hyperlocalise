export class TmsProviderLiveError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "TmsProviderLiveError";
  }
}

/**
 * Raised when some provider jobs were created before a later locale/task failed.
 * Callers should expose {@link createdCount} / {@link jobs} so clients can refresh
 * and avoid duplicate retries for the locales that already succeeded.
 */
export class TmsProviderLivePartialCreateError extends TmsProviderLiveError {
  constructor(
    message: string,
    readonly createdCount: number,
    readonly jobs: unknown[],
  ) {
    super("provider_task_create_partial", message);
    this.name = "TmsProviderLivePartialCreateError";
  }
}
