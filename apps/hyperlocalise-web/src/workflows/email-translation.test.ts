import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@/lib/env", () => ({
  env: {
    OPENAI_API_KEY: "test-openai-api-key",
    RESEND_API_KEY: "test-key",
    RESEND_FROM_NAME: "Hyperlocalise",
  },
}));

import {
  buildTempConfig,
  getTranslatedFileDiagnostics,
  getSandboxInputFilename,
  getSandboxOutputFilename,
  getSandboxTranslationEnv,
} from "./email-translation";

describe("email translation workflow filenames", () => {
  it("preserves the attachment extension for sandbox input and output files", () => {
    expect(getSandboxInputFilename("en-US.json")).toBe("en-US.json");
    expect(getSandboxOutputFilename("en-US.json", "vi")).toBe("en-US-vi.json");
  });

  it("keeps extensionless input and output filenames aligned", () => {
    expect(getSandboxInputFilename("README")).toBe("README");
    expect(getSandboxOutputFilename("README", "vi")).toBe("README-vi");
  });

  it("sanitizes unsafe attachment filename characters without dropping the extension", () => {
    expect(getSandboxInputFilename("../en US.json")).toBe(".._en_US.json");
    expect(getSandboxOutputFilename("../en US.json", "vi")).toBe(".._en_US-vi.json");
  });

  it("passes provider credentials to the sandbox translation command", () => {
    expect(getSandboxTranslationEnv()).toEqual({
      OPENAI_API_KEY: "test-openai-api-key",
    });
  });
});

describe("email translation temporary config", () => {
  it("includes user style instructions in the system prompt when present", () => {
    const config = buildTempConfig("source.json", "target.json", "en", "fr", "Keep it formal.");

    expect(config).toContain("system_prompt:");
    expect(config).toContain("User style instructions: Keep it formal.");
    expect(config).toContain("user_prompt:");
    expect(config).toContain("{{input}}");
  });

  it("omits the user style instruction line when instructions are absent", () => {
    const config = buildTempConfig("source.json", "target.json", "en", "fr", null);

    expect(config).toContain("system_prompt:");
    expect(config).not.toContain("User style instructions:");
  });
});

describe("translated file diagnostics", () => {
  it("captures byte-level metadata and JSON parse status without logging content", async () => {
    const diagnostics = await getTranslatedFileDiagnostics(
      Buffer.from('{"hello":"Xin chao"}\n'),
      "vi.json",
    );

    expect(diagnostics).toEqual({
      filename: "vi.json",
      byteLength: 21,
      sha256: "c84a10b6c11b42e0e94cf12a7e0fb58fbee9640e8f1ff7b440b88d45a689ab86",
      firstBytesHex: "7b2268656c6c6f223a2258696e206368",
      contentType: "application/json; charset=utf-8",
      isUtf8: true,
      jsonParseOk: true,
      jsonParseError: null,
    });
  });

  it("reports JSON parse failures for invalid JSON output", async () => {
    const diagnostics = await getTranslatedFileDiagnostics(Buffer.from('{"hello":'), "vi.json");

    expect(diagnostics.jsonParseOk).toBe(false);
    expect(diagnostics.jsonParseError).toBeTruthy();
  });

  it("normalizes Uint8Array content before parsing or byte diagnostics", async () => {
    const diagnostics = await getTranslatedFileDiagnostics(
      new Uint8Array(Buffer.from('{\n  "auth.signIn": "Dang nhap"\n}\n')) as Buffer,
      "en-US-vi.json",
    );

    expect(diagnostics.firstBytesHex).toBe("7b0a202022617574682e7369676e496e");
    expect(diagnostics.jsonParseOk).toBe(true);
    expect(diagnostics.jsonParseError).toBeNull();
  });

  it("normalizes JSON-serialized Buffer content before parsing or byte diagnostics", async () => {
    const diagnostics = await getTranslatedFileDiagnostics(
      Buffer.from('{"hello":"Xin chao"}\n').toJSON(),
      "vi.json",
    );

    expect(diagnostics.sha256).toBe(
      "c84a10b6c11b42e0e94cf12a7e0fb58fbee9640e8f1ff7b440b88d45a689ab86",
    );
    expect(diagnostics.jsonParseOk).toBe(true);
  });

  it("does not attempt JSON parsing for extensionless outputs", async () => {
    const diagnostics = await getTranslatedFileDiagnostics(Buffer.from("translated"), "README");

    expect(diagnostics.jsonParseOk).toBeNull();
    expect(diagnostics.jsonParseError).toBeNull();
  });
});
