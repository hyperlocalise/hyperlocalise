export type OtaErrorCode =
  | "not_found"
  | "http_error"
  | "network_error"
  | "timeout"
  | "invalid_manifest"
  | "invalid_content"
  | "unsupported_format"
  | "unknown_locale";

export class OtaError extends Error {
  readonly code: OtaErrorCode;
  readonly status?: number;
  readonly url?: string;

  constructor(
    code: OtaErrorCode,
    message: string,
    options: { status?: number; url?: string; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "OtaError";
    this.code = code;
    this.status = options.status;
    this.url = options.url;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}
