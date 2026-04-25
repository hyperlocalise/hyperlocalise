import pino from "pino";
import type { Logger as ChatLogger } from "chat";

const root = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(process.env.NODE_ENV !== "production"
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
});

export function createChatLogger(prefix?: string): ChatLogger {
  const base = prefix ? root.child({ prefix }) : root;
  return {
    child: (subPrefix) => createChatLogger(prefix ? `${prefix}:${subPrefix}` : subPrefix),
    debug: (msg, ...args) => base.debug(args.length > 0 ? { args } : {}, msg),
    error: (msg, ...args) => base.error(args.length > 0 ? { args } : {}, msg),
    info: (msg, ...args) => base.info(args.length > 0 ? { args } : {}, msg),
    warn: (msg, ...args) => base.warn(args.length > 0 ? { args } : {}, msg),
  };
}

export function createLogger(prefix?: string): pino.Logger {
  return prefix ? root.child({ prefix }) : root;
}
