export class TmsProviderLiveError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "TmsProviderLiveError";
  }
}
