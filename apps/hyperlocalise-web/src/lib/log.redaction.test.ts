import { describe, it, expect } from "vite-plus/test";
import pino from "pino";
import { REDACTION_PATHS } from "./log";

describe("Logger Redaction", () => {
  it("should redact sensitive fields", () => {
    let loggedData = "";
    const stream = {
      write: (msg: string) => {
        loggedData += msg;
      },
    };

    const logger = pino(
      {
        redact: {
          paths: REDACTION_PATHS,
          censor: "[REDACTED]",
        },
      },
      stream,
    );

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

    const parsed = JSON.parse(loggedData);
    expect(parsed.apiKey).toBe("[REDACTED]");
    expect(parsed.safeField).toBe("visible");
    expect(parsed.nested.password).toBe("[REDACTED]");
    expect(parsed.nested.token).toBe("[REDACTED]");
    expect(parsed.authTag).toBe("[REDACTED]");
  });

  it("should redact sensitive headers", () => {
    let loggedData = "";
    const stream = {
      write: (msg: string) => {
        loggedData += msg;
      },
    };

    const logger = pino(
      {
        redact: {
          paths: REDACTION_PATHS,
          censor: "[REDACTED]",
        },
      },
      stream,
    );

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

    const parsed = JSON.parse(loggedData);
    expect(parsed.headers.authorization).toBe("[REDACTED]");
    expect(parsed.headers["x-api-key"]).toBe("[REDACTED]");
    expect(parsed.headers["content-type"]).toBe("application/json");
    expect(parsed.headers.cookie).toBe("[REDACTED]");
    expect(parsed.headers["x-workos-signature"]).toBe("[REDACTED]");
  });

  it("should redact top-level hyphenated keys", () => {
    let loggedData = "";
    const stream = {
      write: (msg: string) => {
        loggedData += msg;
      },
    };

    const logger = pino(
      {
        redact: {
          paths: REDACTION_PATHS,
          censor: "[REDACTED]",
        },
      },
      stream,
    );

    logger.info(
      { "x-api-key": "top-level-key", "x-workos-signature": "sig" },
      "test hyphenated keys",
    );

    const parsed = JSON.parse(loggedData);
    expect(parsed["x-api-key"]).toBe("[REDACTED]");
    expect(parsed["x-workos-signature"]).toBe("[REDACTED]");
  });

  it("should redact newly added sensitive keys and nested variants", () => {
    let loggedData = "";
    const stream = {
      write: (msg: string) => {
        loggedData += msg;
      },
    };

    const logger = pino(
      {
        redact: {
          paths: REDACTION_PATHS,
          censor: "[REDACTED]",
        },
      },
      stream,
    );

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

    const parsed = JSON.parse(loggedData);
    expect(parsed.access_token).toBe("[REDACTED]");
    expect(parsed.refreshToken).toBe("[REDACTED]");
    expect(parsed.nested.private_key).toBe("[REDACTED]");
    expect(parsed.nested.signingSecret).toBe("[REDACTED]");
    expect(parsed.nested.webhook_secret).toBe("[REDACTED]");
    expect(parsed.nested["svix-signature"]).toBe("[REDACTED]");
    // Note: pino redaction with *. only goes one level deep.
    // Deeply nested keys (2+ levels) won't be redacted by our current rules.
    expect(parsed.deep.level2.masterKey).toBe("secret-master");
    expect(parsed.deep.level2.encryption_key).toBe("secret-encrypt");
  });
});
