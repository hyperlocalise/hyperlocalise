import { describe, it, expect } from "vitest";
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
        },
      },
      "test headers",
    );

    const parsed = JSON.parse(loggedData);
    expect(parsed.headers.authorization).toBe("[REDACTED]");
    // Note: if dot notation is required, this might still fail if pino doesn't handle bracket notation
    // But testing our actual config.
    expect(parsed.headers["x-api-key"]).toBe("[REDACTED]");
    expect(parsed.headers["content-type"]).toBe("application/json");
  });
});
