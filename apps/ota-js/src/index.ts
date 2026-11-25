export {
  createOtaClient,
  DEFAULT_BASE_URL,
  DEFAULT_FALLBACK_BASE_URLS,
  DEFAULT_TIMEOUT_MS,
  MIN_POLL_INTERVAL_MS,
  type GetMessagesOptions,
  type OtaChangeEvent,
  type OtaClient,
  type OtaClientOptions,
  type OtaContentFile,
} from "./client";
export { OtaError, type OtaErrorCode } from "./errors";
export { resolveLocale } from "./locale";
export {
  namespaceFromPath,
  parseManifest,
  SUPPORTED_SCHEMA_VERSION,
  type OtaFormat,
  type OtaManifest,
  type OtaMessages,
} from "./manifest";
export { createLocalStorage, createMemoryStorage, type OtaStorage } from "./storage";
export { unflattenMessages, type NestedMessages } from "./unflatten";
