import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { DrainContext, WideEvent } from "evlog";
import { configureLoggerForTest, createLogger, serializeErrorForLog } from "./log";

const drainedEvents: WideEvent[] = [];

beforeEach(() => {
  drainedEvents.length = 0;
  configureLoggerForTest({
    silent: true,
    drain: (context: DrainContext) => {
      drainedEvents.push(context.event);
    },
  });
});

describe("Logger Redaction", () => {
  it("should redact sensitive fields", () => {
    const logger = createLogger();

    logger.info(
      {
        apiKey: "sk-12345",
        safeField: "visible",
        nested: {
          password: "secret-password",
          token: "deep-token",
        },
        authTag: "some-tag",
      },
      "test message",
    );

    const [event] = drainedEvents;
    const nested = event?.nested as Record<string, unknown>;
    expect(event?.apiKey).toBe("[REDACTED]");
    expect(event?.safeField).toBe("visible");
    expect(nested.password).toBe("[REDACTED]");
    expect(nested.token).toBe("[REDACTED]");
    expect(event?.authTag).toBe("[REDACTED]");
    expect(event?.message).toBe("test message");
  });

  it("should redact sensitive headers", () => {
    const logger = createLogger();

    logger.info(
      {
        headers: {
          authorization: "Bearer secret-token",
          "x-api-key": "secret-api-key",
          "content-type": "application/json",
          cookie: "wos-session=secret-session",
          "x-workos-signature": "secret-signature",
        },
      },
      "test headers",
    );

    const headers = drainedEvents[0]?.headers as Record<string, unknown>;
    expect(headers.authorization).toBe("[REDACTED]");
    expect(headers["x-api-key"]).toBe("[REDACTED]");
    expect(headers["content-type"]).toBe("application/json");
    expect(headers.cookie).toBe("[REDACTED]");
    expect(headers["x-workos-signature"]).toBe("[REDACTED]");
  });

  it("should redact top-level hyphenated keys", () => {
    const logger = createLogger();

    logger.info({ "x-api-key": "top-level-key", "x-workos-signature": "sig" });

    const [event] = drainedEvents;
    expect(event?.["x-api-key"]).toBe("[REDACTED]");
    expect(event?.["x-workos-signature"]).toBe("[REDACTED]");
  });

  it("should redact child logger bindings", () => {
    const logger = createLogger("test").child({
      token: "child-token",
      requestId: "req_123",
    });

    logger.info("test child bindings");

    const [event] = drainedEvents;
    expect(event?.prefix).toBe("test");
    expect(event?.token).toBe("[REDACTED]");
    expect(event?.requestId).toBe("req_123");
  });

  it("should include record context when logging an error", () => {
    const logger = createLogger();

    logger.error(new Error("payment failed"), { userId: "user_123", requestId: "req_123" });

    const [event] = drainedEvents;
    const error = event?.error as Record<string, unknown>;
    expect(error.message).toBe("payment failed");
    expect(event?.userId).toBe("user_123");
    expect(event?.requestId).toBe("req_123");
  });

  it("should preserve serialized error messages alongside log messages", () => {
    const logger = createLogger();

    logger.error({ err: serializeErrorForLog(new Error("sandbox unavailable")) }, "sandbox failed");

    const [event] = drainedEvents;
    const err = event?.err as Record<string, unknown>;
    expect(event?.message).toBe("sandbox failed");
    expect(err.message).toBe("sandbox unavailable");
  });

  it("should redact newly added sensitive keys and nested variants", () => {
    const logger = createLogger();

    logger.info(
      {
        access_token: "secret-access",
        refreshToken: "secret-refresh",
        nested: {
          private_key: "secret-private",
          signingSecret: "secret-signing",
          webhook_secret: "secret-webhook",
          "svix-signature": "secret-svix",
        },
        deep: {
          level2: {
            masterKey: "secret-master",
            encryption_key: "secret-encrypt",
          },
        },
      },
      "test new keys",
    );

    const [event] = drainedEvents;
    const nested = event?.nested as Record<string, unknown>;
    const deep = event?.deep as { level2: Record<string, unknown> };
    expect(event?.access_token).toBe("[REDACTED]");
    expect(event?.refreshToken).toBe("[REDACTED]");
    expect(nested.private_key).toBe("[REDACTED]");
    expect(nested.signingSecret).toBe("[REDACTED]");
    expect(nested.webhook_secret).toBe("[REDACTED]");
    expect(nested["svix-signature"]).toBe("[REDACTED]");
    expect(deep.level2.masterKey).toBe("[REDACTED]");
    expect(deep.level2.encryption_key).toBe("[REDACTED]");
  });

  it("should redact TMS webhook signature and secret headers", () => {
    const logger = createLogger();

    logger.info(
      {
        headers: {
          "x-phraseapp-signature": "phrase-sig",
          "event-signature": "smartling-sig",
          "x-secret": "lokalise-secret",
          "x-hyperlocalise-webhook-secret": "crowdin-secret",
          "x-hyperlocalise-signature-256": "internal-sig",
          "x-provider-signature-256": "provider-sig",
        },
      },
      "test tms headers",
    );

    const headers = drainedEvents[0]?.headers as Record<string, unknown>;
    expect(headers["x-phraseapp-signature"]).toBe("[REDACTED]");
    expect(headers["event-signature"]).toBe("[REDACTED]");
    expect(headers["x-secret"]).toBe("[REDACTED]");
    expect(headers["x-hyperlocalise-webhook-secret"]).toBe("[REDACTED]");
    expect(headers["x-hyperlocalise-signature-256"]).toBe("[REDACTED]");
    expect(headers["x-provider-signature-256"]).toBe("[REDACTED]");
  });

  it("should redact TMS webhook signature and secret keys at top level and nested", () => {
    const logger = createLogger();

    logger.info({
      "x-phraseapp-signature": "top-phrase",
      nested: {
        "event-signature": "nested-smartling",
      },
    });

    const [event] = drainedEvents;
    const nested = event?.nested as Record<string, unknown>;
    expect(event?.["x-phraseapp-signature"]).toBe("[REDACTED]");
    expect(nested["event-signature"]).toBe("[REDACTED]");
  });
});
