import { initLogger, log as evlog } from "evlog";
import type { DrainFn, LogLevel, LoggerConfig } from "evlog";
import type { Logger as ChatLogger } from "chat";

import { errorToLogObject, isError } from "@/lib/serialize-error-for-log";

export { serializeErrorForLog } from "@/lib/serialize-error-for-log";

const isProduction = process.env.NODE_ENV === "production";
const LOG_LEVELS = new Set<LogLevel>(["debug", "info", "warn", "error"]);
const REDACTED = "[REDACTED]";

/**
 * Sensitive keys that should be redacted from logs.
 */
export const REDACTION_PATHS = [
  "apiKey",
  "*.apiKey",
  "token",
  "*.token",
  "accessToken",
  "*.accessToken",
  "access_token",
  "*.access_token",
  "refreshToken",
  "*.refreshToken",
  "refresh_token",
  "*.refresh_token",
  "secret",
  "*.secret",
  "clientSecret",
  "*.clientSecret",
  "client_secret",
  "*.client_secret",
  "password",
  "*.password",
  "passphrase",
  "*.passphrase",
  "credential",
  "*.credential",
  "ciphertext",
  "*.ciphertext",
  "iv",
  "*.iv",
  "authTag",
  "*.authTag",
  "authorization",
  "*.authorization",
  "cookie",
  "*.cookie",
  "privateKey",
  "*.privateKey",
  "private_key",
  "*.private_key",
  "webhookSecret",
  "*.webhookSecret",
  "webhook_secret",
  "*.webhook_secret",
  "signingSecret",
  "*.signingSecret",
  "signing_secret",
  "*.signing_secret",
  "masterKey",
  "*.masterKey",
  "master_key",
  "*.master_key",
  "encryptionKey",
  "*.encryptionKey",
  "encryption_key",
  "*.encryption_key",
  '["x-api-key"]',
  '*.["x-api-key"]',
  "x-api-key",
  '["x-workos-signature"]',
  '*.["x-workos-signature"]',
  "x-workos-signature",
  '["x-hub-signature-256"]',
  '*.["x-hub-signature-256"]',
  "x-hub-signature-256",
  '["x-slack-signature"]',
  '*.["x-slack-signature"]',
  "x-slack-signature",
  '["svix-signature"]',
  '*.["svix-signature"]',
  "svix-signature",
  "headers.authorization",
  "headers.cookie",
  'headers["x-api-key"]',
  "headers.x-api-key",
  'headers["x-workos-signature"]',
  "headers.x-workos-signature",
  'headers["x-hub-signature-256"]',
  "headers.x-hub-signature-256",
  'headers["x-slack-signature"]',
  "headers.x-slack-signature",
  'headers["svix-signature"]',
  "headers.svix-signature",
];

const REDACTION_KEYS = new Set(
  REDACTION_PATHS.map((path) => path.split(".").at(-1)?.toLowerCase()).filter(
    (key): key is string => Boolean(key),
  ),
);

type LogBindings = Record<string, unknown>;
type LogInput = string | Error | LogBindings;
type LogMethod = (input: LogInput, messageOrContext?: unknown, ...args: unknown[]) => void;

export type Logger = {
  child: (bindings: LogBindings) => Logger;
  debug: LogMethod;
  error: LogMethod;
  info: LogMethod;
  warn: LogMethod;
};

function logLevelFromEnv(value: string | undefined): LogLevel {
  return LOG_LEVELS.has(value as LogLevel) ? (value as LogLevel) : "info";
}

function initializeLogger(config: Pick<LoggerConfig, "drain" | "silent"> = {}) {
  initLogger({
    env: {
      service: "hyperlocalise-web",
      environment: process.env.NODE_ENV ?? "development",
    },
    minLevel: logLevelFromEnv(process.env.LOG_LEVEL),
    pretty: !isProduction,
    redact: {
      paths: REDACTION_PATHS,
      builtins: false,
      replacement: REDACTED,
    },
    ...config,
  });
}

initializeLogger();

export function configureLoggerForTest(config: { drain?: DrainFn; silent?: boolean }) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("configureLoggerForTest must not be called in production");
  }
  initializeLogger(config);
}

function isRecord(value: unknown): value is LogBindings {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (isError(value)) {
    return sanitizeValue(errorToLogObject(value), seen);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, seen));
  }

  if (!isRecord(value)) {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  const sanitized: LogBindings = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    sanitized[key] = REDACTION_KEYS.has(key.toLowerCase())
      ? REDACTED
      : sanitizeValue(nestedValue, seen);
  }

  seen.delete(value);
  return sanitized;
}

function sanitizeRecord(value: LogBindings): LogBindings {
  return sanitizeValue(value) as LogBindings;
}

function mergeLogContext(bindings: LogBindings, input: LogInput, messageOrContext?: unknown) {
  const event: LogBindings = { ...bindings };

  if (typeof input === "string") {
    event.message = input;
    if (isRecord(messageOrContext)) {
      Object.assign(event, sanitizeValue(messageOrContext));
    } else if (isError(messageOrContext)) {
      event.error = sanitizeValue(messageOrContext);
    } else if (messageOrContext !== undefined) {
      event.value = sanitizeValue(messageOrContext);
    }
    return event;
  }

  if (isError(input)) {
    event.error = sanitizeValue(input);
    if (typeof messageOrContext === "string") {
      event.message = messageOrContext;
    } else if (isRecord(messageOrContext)) {
      Object.assign(event, sanitizeValue(messageOrContext));
    }
    return event;
  }

  Object.assign(event, sanitizeValue(input));
  if (typeof messageOrContext === "string") {
    event.message = messageOrContext;
  } else if (isRecord(messageOrContext)) {
    Object.assign(event, sanitizeValue(messageOrContext));
  }
  return event;
}

function emit(level: LogLevel, bindings: LogBindings, input: LogInput, messageOrContext?: unknown) {
  evlog[level](mergeLogContext(bindings, input, messageOrContext));
}

export function createChatLogger(prefix?: string): ChatLogger {
  const base = createLogger(prefix);
  return {
    child: (subPrefix) => createChatLogger(prefix ? `${prefix}:${subPrefix}` : subPrefix),
    debug: (msg, ...args) => base.debug(String(msg), { args }),
    error: (msg, ...args) => base.error(String(msg), { args }),
    info: (msg, ...args) => base.info(String(msg), { args }),
    warn: (msg, ...args) => base.warn(String(msg), { args }),
  };
}

export function createLogger(prefix?: string): Logger {
  const bindings = prefix ? { prefix } : {};

  return {
    child: (childBindings) =>
      createBoundLogger({
        ...bindings,
        ...sanitizeRecord(childBindings),
      }),
    debug: (input, messageOrContext) => emit("debug", bindings, input, messageOrContext),
    error: (input, messageOrContext) => emit("error", bindings, input, messageOrContext),
    info: (input, messageOrContext) => emit("info", bindings, input, messageOrContext),
    warn: (input, messageOrContext) => emit("warn", bindings, input, messageOrContext),
  };
}

function createBoundLogger(bindings: LogBindings): Logger {
  return {
    child: (childBindings) =>
      createBoundLogger({
        ...bindings,
        ...sanitizeRecord(childBindings),
      }),
    debug: (input, messageOrContext) => emit("debug", bindings, input, messageOrContext),
    error: (input, messageOrContext) => emit("error", bindings, input, messageOrContext),
    info: (input, messageOrContext) => emit("info", bindings, input, messageOrContext),
    warn: (input, messageOrContext) => emit("warn", bindings, input, messageOrContext),
  };
}
