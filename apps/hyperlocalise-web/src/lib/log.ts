import pino from "pino";
import type { Logger as ChatLogger } from "chat";

const isEdge = process.env.NEXT_RUNTIME === "edge";
const isProduction = process.env.NODE_ENV === "production";

/**
 * Sensitive keys that should be redacted from logs.
 */
export const REDACTION_PATHS = [
  "apiKey",
  "token",
  "secret",
  "password",
  "credential",
  "ciphertext",
  "iv",
  "authTag",
  "authorization",
  "cookie",
  '["x-api-key"]',
  '["x-workos-signature"]',
  'headers["x-hub-signature-256"]',
  'headers["x-slack-signature"]',
  '["x-hub-signature-256"]',
  '["x-slack-signature"]',
  "*.apiKey",
  "*.token",
  "*.secret",
  "*.password",
  "*.credential",
  "*.ciphertext",
  "*.iv",
  "*.authTag",
  "*.authorization",
  "*.cookie",
  "*.x-api-key",
  "*.x-workos-signature",
  "*.x-hub-signature-256",
  "*.x-slack-signature",
  "headers.authorization",
  "headers.cookie",
  'headers["x-api-key"]',
  'headers["x-workos-signature"]',
  'headers["x-hub-signature-256"]',
  'headers["x-slack-signature"]',
];

const root = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: REDACTION_PATHS,
    censor: "[REDACTED]",
  },
  ...(isProduction || isEdge
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        },
      }),
});

export function createChatLogger(prefix?: string): ChatLogger {
  const base = prefix ? root.child({ prefix }) : root;
  return {
    child: (subPrefix) => createChatLogger(prefix ? `${prefix}:${subPrefix}` : subPrefix),
    debug: (msg, ...args) => base.debug(msg, ...(args as never[])),
    error: (msg, ...args) => base.error(msg, ...(args as never[])),
    info: (msg, ...args) => base.info(msg, ...(args as never[])),
    warn: (msg, ...args) => base.warn(msg, ...(args as never[])),
  };
}

export function createLogger(prefix?: string): pino.Logger {
  return prefix ? root.child({ prefix }) : root;
}
